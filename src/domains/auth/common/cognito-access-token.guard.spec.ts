import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ExecutionContext } from '@nestjs/common';

import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthenticatedRequest } from './authenticated-request.interface';
import { CognitoAccessTokenGuard } from './cognito-access-token.guard';

describe('CognitoAccessTokenGuard', () => {
  let send: jest.Mock;
  let guard: CognitoAccessTokenGuard;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue({
      UserAttributes: [{ Name: 'sub', Value: 'cognito-sub' }],
    });
    guard = new CognitoAccessTokenGuard({ send } as unknown as CognitoIdentityProviderClient);
  });

  function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function createToken(payload: object): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `header.${encodedPayload}.signature`;
  }

  it('stores the Cognito subject and access token after Cognito accepts the token', async () => {
    const accessToken = createToken({ sub: 'cognito-sub' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.auth).toEqual({ cognitoSub: 'cognito-sub', accessToken });
    expect(send).toHaveBeenCalledWith(expect.any(GetUserCommand));
  });

  it.each([
    undefined,
    'Basic credentials',
    'Bearer',
    'Bearer invalid-token',
    `Bearer ${createToken({})}`,
    'Bearer header.not-json.signature',
  ])('rejects an invalid authorization header: %s', async (authorization) => {
    const request: Partial<AuthenticatedRequest> = { headers: { authorization } };

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a token revoked by Cognito', async () => {
    send.mockRejectedValueOnce({ name: 'NotAuthorizedException' });
    const accessToken = createToken({ sub: 'cognito-sub' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });
    expect(request.auth).toBeUndefined();
  });

  it('rejects a token whose Cognito subject does not match the JWT payload', async () => {
    send.mockResolvedValueOnce({
      UserAttributes: [{ Name: 'sub', Value: 'different-sub' }],
    });
    const accessToken = createToken({ sub: 'cognito-sub' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });
  });
});
