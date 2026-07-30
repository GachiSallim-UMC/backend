import { GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

import { createChatWebSocketAuthorizerHandler } from './chat-websocket-authorizer';

function createTokenWithSubject(sub: string | undefined): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(sub === undefined ? {} : { sub })).toString('base64url');

  return `${header}.${payload}.signature`;
}

describe('chat websocket $connect authorizer', () => {
  const methodArn = 'arn:aws:execute-api:ap-northeast-2:123456789012:abc123/develop/$connect';

  it('denies the connection when no token is provided', async () => {
    const send = jest.fn();
    const client = { send } as unknown as import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient;
    const handler = createChatWebSocketAuthorizerHandler(client);

    const result = await handler({ methodArn, queryStringParameters: {} });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
    expect(send).not.toHaveBeenCalled();
  });

  it('denies the connection when the token has no subject claim', async () => {
    const send = jest.fn();
    const client = { send } as unknown as import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient;
    const handler = createChatWebSocketAuthorizerHandler(client);

    const result = await handler({
      methodArn,
      queryStringParameters: { token: createTokenWithSubject(undefined) },
    });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
    expect(send).not.toHaveBeenCalled();
  });

  it('denies the connection when Cognito rejects the token', async () => {
    const send = jest.fn().mockRejectedValue(new Error('NotAuthorizedException'));
    const client = { send } as unknown as import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient;
    const handler = createChatWebSocketAuthorizerHandler(client);

    const result = await handler({
      methodArn,
      queryStringParameters: { token: createTokenWithSubject('user-sub') },
    });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('denies the connection when the verified subject does not match the token claim', async () => {
    const send = jest.fn().mockResolvedValue({
      UserAttributes: [{ Name: 'sub', Value: 'different-sub' }],
    });
    const client = { send } as unknown as import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient;
    const handler = createChatWebSocketAuthorizerHandler(client);

    const result = await handler({
      methodArn,
      queryStringParameters: { token: createTokenWithSubject('user-sub') },
    });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('allows the connection and forwards the cognitoSub/accessToken in context', async () => {
    const send = jest.fn().mockResolvedValue({
      UserAttributes: [{ Name: 'sub', Value: 'user-sub' }],
    });
    const client = { send } as unknown as import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient;
    const handler = createChatWebSocketAuthorizerHandler(client);
    const token = createTokenWithSubject('user-sub');

    const result = await handler({ methodArn, queryStringParameters: { token } });

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Allow');
    expect(result.principalId).toBe('user-sub');
    expect(result.context).toEqual({ cognitoSub: 'user-sub', accessToken: token });
    expect(send).toHaveBeenCalledWith(expect.any(GetUserCommand));
  });
});
