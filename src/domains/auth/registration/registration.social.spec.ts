import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service';
import { AuthContext } from '../common/auth-context.interface';
import { SocialSignupDto } from './dto/social-signup.dto';
import { AuthRegistrationService } from './registration.service';

describe('AuthRegistrationService social signup', () => {
  const auth: AuthContext = { cognitoSub: 'cognito-sub', accessToken: 'access-token' };
  const dto: SocialSignupDto = { name: '홍길동', nickname: '길동' };
  const createdUser = {
    id: 1n,
    email: 'member@example.com',
    name: dto.name,
    nickname: dto.nickname,
    profileImage: null,
    isActive: true,
  };

  let send: jest.Mock;
  let findUnique: jest.Mock;
  let createUser: jest.Mock;
  let createIdentity: jest.Mock;
  let transaction: jest.Mock;
  let service: AuthRegistrationService;

  beforeEach(() => {
    send = jest.fn();
    findUnique = jest.fn().mockResolvedValue(null);
    createUser = jest.fn().mockResolvedValue(createdUser);
    createIdentity = jest.fn().mockResolvedValue({ id: 1n });
    transaction = jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({
        user: { create: createUser },
        userAuthIdentity: { create: createIdentity },
      }),
    );

    const configService = {
      getOrThrow: jest.fn((key: string) =>
        key === 'COGNITO_CLIENT_ID' ? 'client-id' : 'ap-northeast-2_pool',
      ),
    } as unknown as ConfigService;
    const prisma = {
      $transaction: transaction,
      userAuthIdentity: { findUnique, findFirst: jest.fn() },
      user: { update: jest.fn() },
    } as unknown as PrismaService;

    service = new AuthRegistrationService(
      { send } as unknown as CognitoIdentityProviderClient,
      configService,
      prisma,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['Google', 'GOOGLE'],
    ['SignInWithApple', 'APPLE'],
    ['Kakao', 'KAKAO'],
  ])('creates an active local user for %s', async (providerName, provider) => {
    const authenticatedAt = new Date('2026-07-22T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(authenticatedAt);
    send.mockResolvedValue(cognitoUser(providerName));

    await expect(service.socialSignup(auth, dto)).resolves.toEqual({
      userId: 1,
      name: dto.name,
      nickname: dto.nickname,
      email: 'member@example.com',
      profileImage: null,
    });
    expect(send).toHaveBeenCalledWith(expect.any(GetUserCommand));
    expect(createUser).toHaveBeenCalledWith({
      data: {
        email: 'member@example.com',
        name: dto.name,
        nickname: dto.nickname,
        isActive: true,
      },
    });
    expect(createIdentity).toHaveBeenCalledWith({
      data: {
        userId: 1n,
        cognitoSub: auth.cognitoSub,
        provider,
        providerUserId: `${providerName}-user-id`,
        email: 'member@example.com',
        lastAuthenticatedAt: authenticatedAt,
      },
    });
  });

  it('returns the existing active account idempotently', async () => {
    send.mockResolvedValue(cognitoUser('Google'));
    findUnique.mockResolvedValue({ user: createdUser });

    await expect(service.socialSignup(auth, dto)).resolves.toEqual({
      userId: 1,
      name: dto.name,
      nickname: dto.nickname,
      email: 'member@example.com',
      profileImage: null,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    [[], 'AUTH_SOCIAL_PROVIDER_UNSUPPORTED'],
    [[{ providerName: 'Unknown', userId: 'id' }], 'AUTH_SOCIAL_PROVIDER_UNSUPPORTED'],
  ])('rejects an unsupported provider identity', async (identities, code) => {
    send.mockResolvedValue(cognitoUserResponse(identities));

    await expect(service.socialSignup(auth, dto)).rejects.toMatchObject({ code });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'true'],
    ['member@example.com', 'false'],
  ])('requires a verified social email', async (email, emailVerified) => {
    send.mockResolvedValue(
      cognitoUserResponse([{ providerName: 'Google', userId: 'id' }], {
        email,
        emailVerified,
      }),
    );

    await expect(service.socialSignup(auth, dto)).rejects.toMatchObject({
      code: 'AUTH_SOCIAL_EMAIL_REQUIRED',
    });
  });

  it('returns a link-required conflict when a different account owns the email', async () => {
    send.mockResolvedValue(cognitoUser('Google'));
    transaction.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue(null);

    await expect(service.socialSignup(auth, dto)).rejects.toMatchObject({
      code: 'AUTH_SOCIAL_ACCOUNT_LINK_REQUIRED',
    });
  });

  it('reconciles a concurrent signup that created the same Cognito identity', async () => {
    send.mockResolvedValue(cognitoUser('Google'));
    transaction.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: createdUser });

    await expect(service.socialSignup(auth, dto)).resolves.toMatchObject({ userId: 1 });
  });

  it('propagates non-unique database failures', async () => {
    send.mockResolvedValue(cognitoUser('Google'));
    transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(service.socialSignup(auth, dto)).rejects.toThrow('database unavailable');
  });

  it('maps an expired Cognito token to unauthorized', async () => {
    send.mockRejectedValue({ name: 'NotAuthorizedException' });

    await expect(service.socialSignup(auth, dto)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });
  });

  function cognitoUser(providerName: string) {
    return cognitoUserResponse([{ providerName, userId: `${providerName}-user-id` }]);
  }

  function cognitoUserResponse(
    identities: unknown[],
    options: { email?: string; emailVerified?: string } = {},
  ) {
    const email = 'email' in options ? options.email : ' Member@Example.com ';
    const emailVerified = options.emailVerified ?? 'true';

    return {
      UserAttributes: [
        { Name: 'sub', Value: auth.cognitoSub },
        ...(email === undefined ? [] : [{ Name: 'email', Value: email }]),
        { Name: 'email_verified', Value: emailVerified },
        { Name: 'identities', Value: JSON.stringify(identities) },
      ],
    };
  }
});
