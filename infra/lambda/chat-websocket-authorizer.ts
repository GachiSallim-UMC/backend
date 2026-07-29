import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayAuthorizerResult } from 'aws-lambda';

interface WebSocketAuthorizerEvent {
  methodArn: string;
  queryStringParameters?: Record<string, string | undefined>;
}

export function createChatWebSocketAuthorizerHandler(client: CognitoIdentityProviderClient) {
  return async (event: WebSocketAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return denyPolicy(event.methodArn);
    }

    const claimedSub = decodeJwtSubject(token);
    if (!claimedSub) {
      return denyPolicy(event.methodArn);
    }

    try {
      const response = await client.send(new GetUserCommand({ AccessToken: token }));
      const verifiedSub = response.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;

      if (verifiedSub !== claimedSub) {
        return denyPolicy(event.methodArn);
      }
    } catch {
      return denyPolicy(event.methodArn);
    }

    return allowPolicy(event.methodArn, claimedSub, token);
  };
}

function decodeJwtSubject(token: string): string | undefined {
  try {
    const segments = token.split('.');
    if (segments.length !== 3 || !segments[1]) {
      return undefined;
    }

    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as unknown;
    if (typeof payload !== 'object' || payload === null || !('sub' in payload)) {
      return undefined;
    }

    const sub = (payload as { sub: unknown }).sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
  } catch {
    return undefined;
  }
}

function allowPolicy(
  methodArn: string,
  cognitoSub: string,
  accessToken: string,
): APIGatewayAuthorizerResult {
  return {
    principalId: cognitoSub,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: methodArn }],
    },
    context: { cognitoSub, accessToken },
  };
}

function denyPolicy(methodArn: string): APIGatewayAuthorizerResult {
  return {
    principalId: 'anonymous',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: methodArn }],
    },
  };
}

const client = new CognitoIdentityProviderClient({});

export const handler = createChatWebSocketAuthorizerHandler(client);
