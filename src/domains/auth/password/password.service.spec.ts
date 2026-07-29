import {
  ChangePasswordCommand,
  ConfirmForgotPasswordCommand,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PasswordService } from './password.service';

type MockedCognitoClient = {
  send: jest.MockedFunction<
    (
      command:
        | ChangePasswordCommand
        | ConfirmForgotPasswordCommand
        | ForgotPasswordCommand
        | GetUserCommand,
    ) => Promise<unknown>
  >;
};

function cognitoError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('PasswordService', () => {
  let cognitoClient: MockedCognitoClient;
  let service: PasswordService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    cognitoClient = {
      send: jest.fn(),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('cognito-client-id'),
    } as unknown as ConfigService;
    service = new PasswordService(
      cognitoClient as unknown as CognitoIdentityProviderClient,
      configService,
    );
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('requests a password reset email through Cognito', async () => {
    cognitoClient.send.mockResolvedValue({});

    await expect(service.requestPasswordReset({ email: 'member@example.com' })).resolves.toEqual({
      accepted: true,
    });

    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    expect(cognitoClient.send.mock.calls[0][0]).toBeInstanceOf(ForgotPasswordCommand);
    expect(cognitoClient.send.mock.calls[0][0].input).toEqual({
      ClientId: 'cognito-client-id',
      Username: 'member@example.com',
    });
  });

  it.each([
    'CodeDeliveryFailureException',
    'InternalErrorException',
    'InvalidParameterException',
    'LimitExceededException',
    'NotAuthorizedException',
    'TooManyFailedAttemptsException',
    'TooManyRequestsException',
    'UnexpectedLambdaException',
    'UserNotFoundException',
  ])(
    'does not reveal the password reset delivery result for %s',
    async (errorName) => {
      cognitoClient.send.mockRejectedValue(cognitoError(errorName));

      await expect(service.requestPasswordReset({ email: 'member@example.com' })).resolves.toEqual({
        accepted: true,
      });

      expect(warn).toHaveBeenCalledWith(`Password reset email request failed: ${errorName}`);
    },
  );

  it('resets the password through Cognito', async () => {
    cognitoClient.send.mockResolvedValue({});

    await expect(
      service.resetPassword({
        email: 'member@example.com',
        confirmationCode: '123456',
        newPassword: 'NewPassword1',
      }),
    ).resolves.toEqual({ reset: true });

    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    expect(cognitoClient.send.mock.calls[0][0]).toBeInstanceOf(ConfirmForgotPasswordCommand);
    expect(cognitoClient.send.mock.calls[0][0].input).toEqual({
      ClientId: 'cognito-client-id',
      Username: 'member@example.com',
      ConfirmationCode: '123456',
      Password: 'NewPassword1',
    });
  });

  it('rejects a reset password that violates the local policy', async () => {
    await expect(
      service.resetPassword({
        email: 'member@example.com',
        confirmationCode: '123456',
        newPassword: 'password',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' });
    expect(cognitoClient.send).not.toHaveBeenCalled();
  });

  it.each([
    ['CodeMismatchException', 'AUTH_INVALID_CONFIRMATION_CODE'],
    ['InvalidParameterException', 'AUTH_INVALID_CONFIRMATION_CODE'],
    ['NotAuthorizedException', 'AUTH_INVALID_CONFIRMATION_CODE'],
    ['UserNotFoundException', 'AUTH_INVALID_CONFIRMATION_CODE'],
    ['ExpiredCodeException', 'AUTH_EXPIRED_CONFIRMATION_CODE'],
    ['InvalidPasswordException', 'AUTH_PASSWORD_POLICY_VIOLATION'],
    ['PasswordHistoryPolicyViolationException', 'AUTH_PASSWORD_POLICY_VIOLATION'],
    ['LimitExceededException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyFailedAttemptsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyRequestsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['InternalErrorException', 'AUTH_PROVIDER_ERROR'],
  ])('maps password reset confirmation %s to %s', async (errorName, expectedCode) => {
    cognitoClient.send.mockRejectedValue(cognitoError(errorName));

    await expect(
      service.resetPassword({
        email: 'member@example.com',
        confirmationCode: '123456',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it('changes the password through Cognito', async () => {
    cognitoClient.send.mockResolvedValue({});

    await expect(
      service.changePassword('access-token', {
        previousPassword: 'CurrentPass1',
        newPassword: 'Abcdefghijklmno1',
      }),
    ).resolves.toEqual({ changed: true });

    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    expect(cognitoClient.send.mock.calls[0][0]).toBeInstanceOf(ChangePasswordCommand);
    expect(cognitoClient.send.mock.calls[0][0].input).toEqual({
      AccessToken: 'access-token',
      PreviousPassword: 'CurrentPass1',
      ProposedPassword: 'Abcdefghijklmno1',
    });
  });

  it.each([
    ['too short', 'CurrentPass1', 'Short1A'],
    ['missing an uppercase letter', 'CurrentPass1', 'lowercase1'],
    ['missing a lowercase letter', 'CurrentPass1', 'UPPERCASE1'],
    ['missing a number', 'CurrentPass1', 'NoNumbers'],
    ['longer than the service allows', 'CurrentPass1', `A1${'a'.repeat(15)}`],
    ['containing whitespace', 'CurrentPass1', 'New Password1'],
    ['the same as the current password', 'CurrentPass1', 'CurrentPass1'],
  ])('rejects a password that is %s', async (_caseName, previousPassword, newPassword) => {
    await expect(
      service.changePassword('access-token', { previousPassword, newPassword }),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' });
    expect(cognitoClient.send).not.toHaveBeenCalled();
  });

  it.each([
    ['longer than Cognito allows', 'a'.repeat(257)],
    ['containing whitespace', 'Current Pass1'],
  ])('rejects a current password that is %s', async (_caseName, previousPassword) => {
    await expect(
      service.changePassword('access-token', {
        previousPassword,
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: 'COMMON_INVALID_PARAMETER' });
    expect(cognitoClient.send).not.toHaveBeenCalled();
  });

  it.each([
    ['InvalidParameterException', 'AUTH_PASSWORD_POLICY_VIOLATION'],
    ['InvalidPasswordException', 'AUTH_PASSWORD_POLICY_VIOLATION'],
    ['PasswordHistoryPolicyViolationException', 'AUTH_PASSWORD_POLICY_VIOLATION'],
    ['LimitExceededException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyFailedAttemptsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['TooManyRequestsException', 'AUTH_TOO_MANY_REQUESTS'],
    ['InternalErrorException', 'AUTH_PROVIDER_ERROR'],
  ])('maps %s to %s', async (errorName, expectedCode) => {
    cognitoClient.send.mockRejectedValue(cognitoError(errorName));

    await expect(
      service.changePassword('access-token', {
        previousPassword: 'CurrentPass1',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it('classifies NotAuthorized as an invalid current password when the token is active', async () => {
    cognitoClient.send
      .mockRejectedValueOnce(cognitoError('NotAuthorizedException'))
      .mockResolvedValueOnce({});

    await expect(
      service.changePassword('access-token', {
        previousPassword: 'WrongCurrent1',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_CURRENT_PASSWORD_INVALID' });
    expect(cognitoClient.send.mock.calls[1][0]).toBeInstanceOf(GetUserCommand);
  });

  it('classifies NotAuthorized as unauthorized when Cognito also rejects the token', async () => {
    cognitoClient.send.mockRejectedValue(cognitoError('NotAuthorizedException'));

    await expect(
      service.changePassword('revoked-token', {
        previousPassword: 'CurrentPass1',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });

  it('maps non-Error failures to a provider error', async () => {
    cognitoClient.send.mockRejectedValue('unexpected failure');

    await expect(
      service.changePassword('access-token', {
        previousPassword: 'CurrentPass1',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_PROVIDER_ERROR' });
  });
});
