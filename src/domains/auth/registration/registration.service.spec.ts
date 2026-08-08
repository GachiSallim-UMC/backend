import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service';
import { ConfirmSignupDto } from './dto/confirm-signup.dto';
import { ResendSignupEmailDto } from './dto/resend-signup-email.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthRegistrationService } from './registration.service';

describe('AuthRegistrationService', () => {
  const signupDto: SignupDto = {
    email: 'user@example.com',
    password: 'Password123',
    name: '홍길동',
    nickname: '길동',
  };
  const confirmDto: ConfirmSignupDto = {
    email: signupDto.email,
    confirmationCode: '123456',
  };
  const resendDto: ResendSignupEmailDto = { email: signupDto.email };

  let send: jest.Mock;
  let createUser: jest.Mock;
  let createIdentity: jest.Mock;
  let transaction: jest.Mock;
  let findIdentity: jest.Mock;
  let updateUser: jest.Mock;
  let service: AuthRegistrationService;

  beforeEach(() => {
    send = jest.fn();
    createUser = jest.fn().mockResolvedValue({
      id: 1n,
      email: signupDto.email,
      name: signupDto.name,
      nickname: signupDto.nickname,
      isActive: false,
    });
    createIdentity = jest.fn().mockResolvedValue({ id: 1n });
    transaction = jest.fn(
      async (
        callback: (transactionClient: {
          user: { create: typeof createUser };
          userAuthIdentity: { create: typeof createIdentity };
        }) => Promise<unknown>,
      ) => callback({ user: { create: createUser }, userAuthIdentity: { create: createIdentity } }),
    );
    findIdentity = jest.fn();
    updateUser = jest.fn();

    const configValues: Record<string, string> = {
      COGNITO_CLIENT_ID: 'client-id',
      COGNITO_USER_POOL_ID: 'ap-northeast-2_pool',
    };
    const configService = {
      getOrThrow: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    const prisma = {
      $transaction: transaction,
      userAuthIdentity: { findFirst: findIdentity },
      user: { update: updateUser },
    } as unknown as PrismaService;
    const cognitoClient = { send } as unknown as CognitoIdentityProviderClient;

    service = new AuthRegistrationService(cognitoClient, configService, prisma);
  });

  it('creates an unconfirmed Cognito and database user', async () => {
    send.mockResolvedValueOnce({ UserSub: 'cognito-sub' });

    await expect(service.signup(signupDto)).resolves.toEqual({
      userId: 1,
      email: signupDto.email,
      confirmationRequired: true,
    });
    expect(send).toHaveBeenCalledWith(expect.any(SignUpCommand));
    expect(createUser).toHaveBeenCalledWith({
      data: {
        email: signupDto.email,
        name: signupDto.name,
        nickname: signupDto.nickname,
        isActive: false,
      },
    });
    expect(createIdentity).toHaveBeenCalledWith({
      data: {
        userId: 1n,
        cognitoSub: 'cognito-sub',
        provider: 'COGNITO',
        email: signupDto.email,
      },
    });
  });

  it('maps an existing Cognito username to an email conflict', async () => {
    send.mockRejectedValueOnce({ name: 'UsernameExistsException' });

    await expect(service.signup(signupDto)).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deletes a Cognito user created before SignUp reaches the message limit', async () => {
    send.mockRejectedValueOnce({ name: 'LimitExceededException' }).mockResolvedValueOnce({});

    await expect(service.signup(signupDto)).rejects.toMatchObject({
      code: 'AUTH_TOO_MANY_REQUESTS',
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminDeleteUserCommand));
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deletes the Cognito user when the database transaction fails', async () => {
    send.mockResolvedValueOnce({ UserSub: 'cognito-sub' }).mockResolvedValueOnce({});
    transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(service.signup(signupDto)).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminDeleteUserCommand));
  });

  it('reports a compensation failure when the Cognito user cannot be deleted', async () => {
    send
      .mockResolvedValueOnce({ UserSub: 'cognito-sub' })
      .mockRejectedValueOnce({ name: 'InternalErrorException' });
    transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.signup(signupDto)).rejects.toMatchObject({
      code: 'AUTH_COMPENSATION_FAILED',
    });
  });

  it('confirms Cognito signup and activates the database user', async () => {
    findIdentity.mockResolvedValue({
      userId: 1n,
      email: signupDto.email,
      user: { id: 1n, isActive: false },
    });
    send.mockResolvedValueOnce({});
    updateUser.mockResolvedValue({ id: 1n });

    await expect(service.confirmSignup(confirmDto)).resolves.toEqual({
      userId: 1,
      email: signupDto.email,
      confirmed: true,
    });
    expect(send).toHaveBeenCalledWith(expect.any(ConfirmSignUpCommand));
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { isActive: true },
    });
  });

  it('reconciles local activation when a retry finds Cognito already confirmed', async () => {
    findIdentity.mockResolvedValue({
      userId: 1n,
      email: signupDto.email,
      user: { id: 1n, isActive: false },
    });
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ name: 'NotAuthorizedException' })
      .mockResolvedValueOnce({ UserStatus: 'CONFIRMED', Enabled: true });
    updateUser
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ id: 1n });

    await expect(service.confirmSignup(confirmDto)).rejects.toThrow('database unavailable');
    await expect(service.confirmSignup(confirmDto)).resolves.toEqual({
      userId: 1,
      email: signupDto.email,
      confirmed: true,
    });
    expect(send).toHaveBeenNthCalledWith(3, expect.any(AdminGetUserCommand));
  });

  it.each([
    ['CodeMismatchException', 'AUTH_INVALID_CONFIRMATION_CODE'],
    ['ExpiredCodeException', 'AUTH_EXPIRED_CONFIRMATION_CODE'],
  ])('maps %s while confirming signup', async (name, code) => {
    findIdentity.mockResolvedValue({
      userId: 1n,
      email: signupDto.email,
      user: { id: 1n, isActive: false },
    });
    send.mockRejectedValueOnce({ name });

    await expect(service.confirmSignup(confirmDto)).rejects.toMatchObject({ code });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns an idempotent success for an already active local user', async () => {
    findIdentity.mockResolvedValue({
      userId: 1n,
      email: signupDto.email,
      user: { id: 1n, isActive: true },
    });

    await expect(service.confirmSignup(confirmDto)).resolves.toEqual({
      userId: 1,
      email: signupDto.email,
      confirmed: true,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('resends the signup confirmation email for an inactive Cognito user', async () => {
    findIdentity.mockResolvedValue({
      email: signupDto.email,
      user: { isActive: false },
    });
    send
      .mockResolvedValueOnce({ UserStatus: 'UNCONFIRMED', Enabled: true })
      .mockResolvedValueOnce({});

    await expect(service.resendSignupEmail(resendDto)).resolves.toEqual({
      email: signupDto.email,
      resent: true,
    });
    expect(send).toHaveBeenNthCalledWith(1, expect.any(AdminGetUserCommand));
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: {
          ClientId: 'client-id',
          Username: signupDto.email,
        },
      }),
    );
  });

  it('rejects a resend request when the local Cognito account does not exist', async () => {
    findIdentity.mockResolvedValue(null);

    await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a resend request when a deleted local identity has no Cognito user', async () => {
    findIdentity.mockResolvedValue({
      email: signupDto.email,
      user: { isActive: false },
    });
    send.mockRejectedValueOnce({ name: 'UserNotFoundException' });

    await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.any(AdminGetUserCommand));
    expect(send).not.toHaveBeenCalledWith(expect.any(ResendConfirmationCodeCommand));
  });

  it.each([
    ['LimitExceededException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyRequestsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['InternalErrorException', 'AUTH_PROVIDER_ERROR'],
  ])('maps %s while checking Cognito state before resending', async (name, code) => {
    findIdentity.mockResolvedValue({
      email: signupDto.email,
      user: { isActive: false },
    });
    send.mockRejectedValueOnce({ name });

    await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({ code });
    expect(send).not.toHaveBeenCalledWith(expect.any(ResendConfirmationCodeCommand));
  });

  it.each([
    ['CONFIRMED', true, 'AUTH_EMAIL_ALREADY_CONFIRMED'],
    ['UNCONFIRMED', false, 'AUTH_ACCOUNT_NOT_FOUND'],
  ])(
    'rejects Cognito status %s with enabled=%s before resending',
    async (userStatus, enabled, code) => {
      findIdentity.mockResolvedValue({
        email: signupDto.email,
        user: { isActive: false },
      });
      send.mockResolvedValueOnce({ UserStatus: userStatus, Enabled: enabled });

      await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({ code });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalledWith(expect.any(ResendConfirmationCodeCommand));
    },
  );

  it('rejects a resend request when signup is already confirmed', async () => {
    findIdentity.mockResolvedValue({
      email: signupDto.email,
      user: { isActive: true },
    });

    await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_CONFIRMED',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['UserNotFoundException', 'AUTH_ACCOUNT_NOT_FOUND'],
    ['InvalidParameterException', 'AUTH_EMAIL_ALREADY_CONFIRMED'],
    ['LimitExceededException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyRequestsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['CodeDeliveryFailureException', 'AUTH_PROVIDER_ERROR'],
  ])('maps %s while resending the signup email', async (name, code) => {
    findIdentity.mockResolvedValue({
      email: signupDto.email,
      user: { isActive: false },
    });
    send
      .mockResolvedValueOnce({ UserStatus: 'UNCONFIRMED', Enabled: true })
      .mockRejectedValueOnce({ name });

    await expect(service.resendSignupEmail(resendDto)).rejects.toMatchObject({ code });
  });
});
