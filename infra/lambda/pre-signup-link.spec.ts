import {
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { createPreSignupHandler } from './pre-signup-link';

describe('pre-signup handling', () => {
  const userPoolId = 'ap-northeast-2_pool';

  it('auto-confirms native Cognito signups without sending a verification email', async () => {
    const send = jest.fn();
    const event = createEvent('PreSignUp_SignUp', 'native-user');

    await expect(run(send, event)).resolves.toBe(event);
    expect(event.response).toEqual({
      autoConfirmUser: true,
      autoVerifyEmail: true,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['Google', 'CONFIRMED', 'google-sub'],
    ['Kakao', 'CONFIRMED', 'kakao-sub'],
    ['Kakao', 'EXTERNAL_PROVIDER', 'kakao-sub'],
  ])(
    'links a verified %s identity to the single %s destination',
    async (provider, userStatus, subject) => {
      const send = jest
        .fn()
        .mockResolvedValueOnce({
          Users: [
            {
              Username: 'existing-user',
              Enabled: true,
              UserStatus: userStatus,
              Attributes: [{ Name: 'email_verified', Value: 'true' }],
            },
          ],
        })
        .mockResolvedValueOnce({});
      const event = createEvent('PreSignUp_ExternalProvider', `${provider}_${subject}`);

      await expect(run(send, event)).resolves.toBe(event);
      expect(send).toHaveBeenNthCalledWith(1, expect.any(ListUsersCommand));
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            UserPoolId: userPoolId,
            DestinationUser: {
              ProviderName: 'Cognito',
              ProviderAttributeValue: 'existing-user',
            },
            SourceUser: {
              ProviderName: provider,
              ProviderAttributeName: 'Cognito_Subject',
              ProviderAttributeValue: subject,
            },
          },
        }),
      );
      expect(send).toHaveBeenNthCalledWith(2, expect.any(AdminLinkProviderForUserCommand));
    },
  );

  it('allows Cognito to create a new federated user when the email is new', async () => {
    const send = jest.fn().mockResolvedValue({ Users: [] });
    const event = createEvent('PreSignUp_ExternalProvider', 'Google_new-sub');

    await expect(run(send, event)).resolves.toBe(event);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Google_sub', '', 'true'],
    ['Google_sub', 'member@example.com', 'false'],
    ['Unknown_sub', 'member@example.com', 'true'],
  ])('rejects an incomplete external identity', async (userName, email, emailVerified) => {
    const send = jest.fn();
    const event = createEvent('PreSignUp_ExternalProvider', userName, email, emailVerified);

    await expect(run(send, event)).rejects.toThrow(
      'A supported provider with a verified email is required',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when a verified email resolves to multiple destination users', async () => {
    const destination = {
      Enabled: true,
      UserStatus: 'CONFIRMED',
      Attributes: [{ Name: 'email_verified', Value: 'true' }],
    };
    const send = jest.fn().mockResolvedValue({
      Users: [
        { ...destination, Username: 'first-user' },
        { ...destination, Username: 'second-user' },
      ],
    });

    await expect(
      run(send, createEvent('PreSignUp_ExternalProvider', 'Google_sub')),
    ).rejects.toThrow('Verified email resolved to multiple Cognito users');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('propagates Cognito errors without exposing user attributes in logs', async () => {
    const send = jest.fn().mockRejectedValue(new Error('Cognito unavailable'));

    await expect(
      run(send, createEvent('PreSignUp_ExternalProvider', 'Google_sub')),
    ).rejects.toThrow('Cognito unavailable');
  });

  function run(send: jest.Mock, event: ReturnType<typeof createEvent>) {
    const client = { send } as unknown as CognitoIdentityProviderClient;
    return createPreSignupHandler(client)(event);
  }

  function createEvent(
    triggerSource: string,
    userName: string,
    email: string | undefined = 'member@example.com',
    emailVerified = 'true',
  ) {
    return {
      triggerSource,
      userName,
      userPoolId,
      request: { userAttributes: { email, email_verified: emailVerified } },
      response: {},
    };
  }
});
