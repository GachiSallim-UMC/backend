import {
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  UserType,
} from '@aws-sdk/client-cognito-identity-provider';

interface PreSignupEvent {
  triggerSource: string;
  userName: string;
  userPoolId: string;
  request: {
    userAttributes: Record<string, string | undefined>;
  };
  response: Record<string, unknown>;
}

const SUPPORTED_PROVIDERS = ['Google', 'SignInWithApple', 'Kakao'] as const;

type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function createPreSignupHandler(client: CognitoIdentityProviderClient) {
  return async (event: PreSignupEvent): Promise<PreSignupEvent> => {
    if (event.triggerSource !== 'PreSignUp_ExternalProvider') {
      return event;
    }

    const provider = parseProvider(event.userName);
    const email = event.request.userAttributes.email;
    const emailVerified = event.request.userAttributes.email_verified;

    if (!provider || !email || emailVerified !== 'true') {
      throw new Error('A supported provider with a verified email is required');
    }

    const response = await client.send(
      new ListUsersCommand({
        UserPoolId: event.userPoolId,
        Filter: `email = "${escapeFilterValue(email)}"`,
        Limit: 10,
      }),
    );
    const candidates = (response.Users ?? []).filter(
      (user) => isVerifiedDestination(user) && user.Username !== event.userName,
    );

    if (candidates.length === 0) {
      return event;
    }

    if (candidates.length !== 1 || !candidates[0].Username) {
      throw new Error('Verified email resolved to multiple Cognito users');
    }

    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: {
          ProviderName: 'Cognito',
          ProviderAttributeValue: candidates[0].Username,
        },
        SourceUser: {
          ProviderName: provider,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: event.userName.slice(provider.length + 1),
        },
      }),
    );

    return event;
  };
}

function parseProvider(userName: string): SupportedProvider | undefined {
  return SUPPORTED_PROVIDERS.find((provider) => userName.startsWith(`${provider}_`));
}

function isVerifiedDestination(user: UserType): boolean {
  const attributes = new Map(
    (user.Attributes ?? []).map((attribute) => [attribute.Name, attribute.Value]),
  );

  return (
    user.Enabled === true &&
    user.UserStatus === 'CONFIRMED' &&
    attributes.get('email_verified') === 'true'
  );
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const client = new CognitoIdentityProviderClient({});

export const handler = createPreSignupHandler(client);
