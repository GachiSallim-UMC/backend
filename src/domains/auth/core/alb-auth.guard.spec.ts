import { ExecutionContext } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlbAuthGuard } from './alb-auth.guard';
import { AuthenticatedRequest } from './auth-context.interface';
import { CognitoAuthGateway } from './cognito-auth.gateway';

describe('AlbAuthGuard', () => {
  const cognitoSub = 'cognito-sub';
  const accessToken = 'access-token';
  const user = {
    id: 1n,
    email: 'user@example.com',
    nickname: '사용자',
    profileImage: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    isActive: true,
  };

  const createContext = (request: Partial<AuthenticatedRequest>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const createGuard = (
    verifyAccessToken = jest.fn<Promise<string>, [string]>().mockResolvedValue(cognitoSub),
    findUnique = jest.fn().mockResolvedValue({ user }),
  ): AlbAuthGuard => {
    const gateway = { verifyAccessToken } as unknown as CognitoAuthGateway;
    const prisma = {
      userAuthIdentity: { findUnique },
    } as unknown as PrismaService;

    return new AlbAuthGuard(gateway, prisma);
  };

  it('attaches the verified user and access token to the request', async () => {
    const request = {
      headers: {
        'x-amzn-oidc-accesstoken': accessToken,
        'x-amzn-oidc-identity': cognitoSub,
      },
    } as Partial<AuthenticatedRequest>;
    const guard = createGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.authContext).toEqual({
      accessToken,
      user: {
        id: user.id,
        cognitoSub,
        email: user.email,
        nickname: user.nickname,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  });

  it('rejects missing ALB authentication headers', async () => {
    const guard = createGuard();

    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('rejects an identity header that does not match the verified token', async () => {
    const guard = createGuard();
    const request = {
      headers: {
        'x-amzn-oidc-accesstoken': accessToken,
        'x-amzn-oidc-identity': 'different-sub',
      },
    } as Partial<AuthenticatedRequest>;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('rejects an access token that Cognito cannot verify', async () => {
    const guard = createGuard(
      jest
        .fn<Promise<string>, [string]>()
        .mockRejectedValue(new BusinessException(ErrorCode.AUTH_UNAUTHORIZED)),
    );
    const request = {
      headers: {
        'x-amzn-oidc-accesstoken': 'tampered-token',
        'x-amzn-oidc-identity': cognitoSub,
      },
    } as Partial<AuthenticatedRequest>;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('rejects an identity that is not linked to a user', async () => {
    const guard = createGuard(
      jest.fn<Promise<string>, [string]>().mockResolvedValue(cognitoSub),
      jest.fn().mockResolvedValue(null),
    );
    const request = {
      headers: {
        'x-amzn-oidc-accesstoken': accessToken,
        'x-amzn-oidc-identity': cognitoSub,
      },
    } as Partial<AuthenticatedRequest>;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('rejects an inactive user', async () => {
    const guard = createGuard(
      jest.fn<Promise<string>, [string]>().mockResolvedValue(cognitoSub),
      jest.fn().mockResolvedValue({ user: { ...user, isActive: false } }),
    );
    const request = {
      headers: {
        'x-amzn-oidc-accesstoken': accessToken,
        'x-amzn-oidc-identity': cognitoSub,
      },
    } as Partial<AuthenticatedRequest>;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });
});
