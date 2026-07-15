import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { AuthSessionService } from './session.service';

describe('AUTH session revocation flow', () => {
  it('rejects the same access token after logout', async () => {
    let revoked = false;
    const send = jest.fn((command: unknown): Promise<unknown> => {
      if (command instanceof GetUserCommand) {
        if (revoked) {
          const error = new Error('revoked');
          error.name = 'NotAuthorizedException';
          return Promise.reject(error);
        }

        return Promise.resolve({ UserAttributes: [{ Name: 'sub', Value: 'cognito-sub' }] });
      }

      if (command instanceof GlobalSignOutCommand) {
        revoked = true;
        return Promise.resolve({});
      }

      return Promise.reject(new Error('Unexpected Cognito command'));
    });
    const cognitoClient = { send } as unknown as CognitoIdentityProviderClient;
    const guard = new CognitoAccessTokenGuard(cognitoClient);
    const sessionService = new AuthSessionService(
      cognitoClient,
      { getOrThrow: jest.fn().mockReturnValue('client-id') } as unknown as ConfigService,
      {} as PrismaService,
    );
    const accessToken = createToken({ sub: 'cognito-sub' });
    const beforeLogout: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };

    await expect(guard.canActivate(createContext(beforeLogout))).resolves.toBe(true);
    await expect(sessionService.logout(beforeLogout.auth!)).resolves.toEqual({ signedOut: true });

    const afterLogout: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
    };
    await expect(guard.canActivate(createContext(afterLogout))).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
    });
  });
});

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createToken(payload: object): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}
