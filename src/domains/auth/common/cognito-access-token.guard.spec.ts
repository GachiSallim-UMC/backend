import { ExecutionContext } from '@nestjs/common';

import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthenticatedRequest } from './authenticated-request.interface';
import { CognitoAccessTokenGuard } from './cognito-access-token.guard';

describe('CognitoAccessTokenGuard', () => {
  const guard = new CognitoAccessTokenGuard();

  function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function createToken(payload: object): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `header.${encodedPayload}.signature`;
  }

  it('stores the Cognito subject and access token on the request', () => {
    const accessToken = createToken({ sub: 'cognito-sub' });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(request.auth).toEqual({ cognitoSub: 'cognito-sub', accessToken });
  });

  it.each([
    undefined,
    'Basic credentials',
    'Bearer',
    'Bearer invalid-token',
    `Bearer ${createToken({})}`,
    'Bearer header.not-json.signature',
  ])('rejects an invalid authorization header: %s', (authorization) => {
    const request: Partial<AuthenticatedRequest> = { headers: { authorization } };

    expect(() => guard.canActivate(createContext(request))).toThrow(BusinessException);
  });
});
