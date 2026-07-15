import {
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

import { PasswordService } from './password.service';

type MockedCognitoClient = {
  send: jest.MockedFunction<(command: ChangePasswordCommand) => Promise<unknown>>;
};

function cognitoError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('PasswordService', () => {
  let cognitoClient: MockedCognitoClient;
  let service: PasswordService;

  beforeEach(() => {
    cognitoClient = {
      send: jest.fn<Promise<unknown>, [ChangePasswordCommand]>(),
    };
    service = new PasswordService(cognitoClient as unknown as CognitoIdentityProviderClient);
  });

  it('changes the password through Cognito', async () => {
    cognitoClient.send.mockResolvedValue({});

    await expect(
      service.changePassword('access-token', {
        previousPassword: 'CurrentPass1',
        newPassword: 'NewPassword1',
      }),
    ).resolves.toEqual({ changed: true });

    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    expect(cognitoClient.send.mock.calls[0][0]).toBeInstanceOf(ChangePasswordCommand);
    expect(cognitoClient.send.mock.calls[0][0].input).toEqual({
      AccessToken: 'access-token',
      PreviousPassword: 'CurrentPass1',
      ProposedPassword: 'NewPassword1',
    });
  });

  it.each([
    ['too short', 'CurrentPass1', 'Short1A'],
    ['missing an uppercase letter', 'CurrentPass1', 'lowercase1'],
    ['missing a lowercase letter', 'CurrentPass1', 'UPPERCASE1'],
    ['missing a number', 'CurrentPass1', 'NoNumbers'],
    ['the same as the current password', 'CurrentPass1', 'CurrentPass1'],
  ])('rejects a password that is %s', async (_caseName, previousPassword, newPassword) => {
    await expect(
      service.changePassword('access-token', { previousPassword, newPassword }),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_POLICY_VIOLATION' });
    expect(cognitoClient.send).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAuthorizedException', 'AUTH_CURRENT_PASSWORD_INVALID'],
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
