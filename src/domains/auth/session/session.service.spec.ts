import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';

import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthSessionService } from './session.service';

describe('AuthSessionService', () => {
  const cognitoSub = 'cognito-sub';
  const accessToken = createToken({ sub: cognitoSub });
  const authenticationResult = {
    AccessToken: accessToken,
    IdToken: 'id-token',
    RefreshToken: 'refresh-token',
    ExpiresIn: 3600,
    TokenType: 'Bearer',
  };

  let send: jest.Mock<Promise<unknown>, [unknown]>;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let service: AuthSessionService;

  beforeEach(() => {
    send = jest.fn<Promise<unknown>, [unknown]>();
    findUnique = jest.fn();
    update = jest.fn();

    const cognitoClient = { send } as unknown as CognitoIdentityProviderClient;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('cognito-client-id'),
    } as unknown as ConfigService;
    const prisma = {
      userAuthIdentity: { findUnique, update },
    } as unknown as PrismaService;

    service = new AuthSessionService(cognitoClient, configService, prisma);
  });

  describe('login', () => {
    it('starts USER_PASSWORD_AUTH, validates the local account, and records the authentication time', async () => {
      send.mockResolvedValue({ AuthenticationResult: authenticationResult });
      findUnique.mockResolvedValue({ id: 11n, user: { isActive: true } });
      update.mockResolvedValue({});

      await expect(
        service.login({ email: 'user@example.com', password: 'Password123' }),
      ).resolves.toEqual({
        accessToken,
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      });

      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0][0] as InitiateAuthCommand;
      expect(command).toBeInstanceOf(InitiateAuthCommand);
      expect(command.input).toEqual({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: 'cognito-client-id',
        AuthParameters: {
          USERNAME: 'user@example.com',
          PASSWORD: 'Password123',
        },
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { cognitoSub },
        include: { user: true },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 11n },
        data: { lastAuthenticatedAt: expect.any(Date) as Date },
      });
    });

    it.each(['NotAuthorizedException', 'UserNotFoundException', 'PasswordResetRequiredException'])(
      'maps %s to AUTH_INVALID_CREDENTIALS',
      async (name) => {
        send.mockRejectedValue(createCognitoError(name));

        await expectBusinessError(
          service.login({ email: 'user@example.com', password: 'wrong' }),
          'AUTH_INVALID_CREDENTIALS',
        );
        expect(findUnique).not.toHaveBeenCalled();
      },
    );

    it('maps an unconfirmed Cognito account to AUTH_EMAIL_NOT_CONFIRMED', async () => {
      send.mockRejectedValue(createCognitoError('UserNotConfirmedException'));

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_EMAIL_NOT_CONFIRMED',
      );
    });

    it('does not reveal a missing local identity', async () => {
      send.mockResolvedValue({ AuthenticationResult: authenticationResult });
      findUnique.mockResolvedValue(null);

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_INVALID_CREDENTIALS',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an inactive local user', async () => {
      send.mockResolvedValue({ AuthenticationResult: authenticationResult });
      findUnique.mockResolvedValue({ id: 11n, user: { isActive: false } });

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_ACCOUNT_INACTIVE',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it.each([
      {},
      { AuthenticationResult: { ...authenticationResult, AccessToken: undefined } },
      { AuthenticationResult: { ...authenticationResult, IdToken: undefined } },
      { AuthenticationResult: { ...authenticationResult, RefreshToken: undefined } },
      { AuthenticationResult: { ...authenticationResult, ExpiresIn: undefined } },
      { AuthenticationResult: { ...authenticationResult, TokenType: undefined } },
    ])('rejects an incomplete Cognito login result: %o', async (response) => {
      send.mockResolvedValue(response);

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_PROVIDER_ERROR',
      );
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('rejects an access token without a subject', async () => {
      send.mockResolvedValue({
        AuthenticationResult: {
          ...authenticationResult,
          AccessToken: createToken({ tokenUse: 'access' }),
        },
      });

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_PROVIDER_ERROR',
      );
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('maps Cognito throttling without exposing the provider error', async () => {
      send.mockRejectedValue(createCognitoError('TooManyRequestsException'));

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_TOO_MANY_REQUESTS',
      );
    });

    it('maps an unexpected Cognito failure to AUTH_PROVIDER_ERROR', async () => {
      send.mockRejectedValue(new Error('provider detail'));

      await expectBusinessError(
        service.login({ email: 'user@example.com', password: 'Password123' }),
        'AUTH_PROVIDER_ERROR',
      );
    });
  });

  describe('refreshToken', () => {
    it('starts REFRESH_TOKEN_AUTH and returns renewed tokens', async () => {
      send.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      });

      await expect(service.refreshToken({ refreshToken: 'refresh-token' })).resolves.toEqual({
        accessToken: 'new-access-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      });

      const command = send.mock.calls[0][0] as InitiateAuthCommand;
      expect(command).toBeInstanceOf(InitiateAuthCommand);
      expect(command.input).toEqual({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: 'cognito-client-id',
        AuthParameters: { REFRESH_TOKEN: 'refresh-token' },
      });
    });

    it('maps an invalid refresh token to AUTH_UNAUTHORIZED', async () => {
      send.mockRejectedValue(createCognitoError('NotAuthorizedException'));

      await expectBusinessError(
        service.refreshToken({ refreshToken: 'invalid' }),
        'AUTH_UNAUTHORIZED',
      );
    });

    it('rejects an incomplete Cognito refresh result', async () => {
      send.mockResolvedValue({ AuthenticationResult: { AccessToken: 'access-token' } });

      await expectBusinessError(
        service.refreshToken({ refreshToken: 'refresh-token' }),
        'AUTH_PROVIDER_ERROR',
      );
    });
  });

  describe('logout', () => {
    it('globally signs out the current Cognito access token', async () => {
      send.mockResolvedValue({});

      await expect(service.logout({ cognitoSub, accessToken })).resolves.toEqual({
        signedOut: true,
      });

      const command = send.mock.calls[0][0] as GlobalSignOutCommand;
      expect(command).toBeInstanceOf(GlobalSignOutCommand);
      expect(command.input).toEqual({ AccessToken: accessToken });
    });

    it('maps a rejected access token to AUTH_UNAUTHORIZED', async () => {
      send.mockRejectedValue(createCognitoError('NotAuthorizedException'));

      await expectBusinessError(service.logout({ cognitoSub, accessToken }), 'AUTH_UNAUTHORIZED');
    });

    it('maps logout throttling to AUTH_TOO_MANY_REQUESTS', async () => {
      send.mockRejectedValue(createCognitoError('LimitExceededException'));

      await expectBusinessError(
        service.logout({ cognitoSub, accessToken }),
        'AUTH_TOO_MANY_REQUESTS',
      );
    });
  });
});

function createToken(payload: object): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function createCognitoError(name: string): Error {
  const error = new Error('provider detail');
  error.name = name;
  return error;
}

async function expectBusinessError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('Expected request to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessException);
    expect((error as BusinessException).code).toBe(code);
    expect((error as BusinessException).message).not.toContain('provider detail');
  }
}
