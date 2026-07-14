import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from './auth-context.interface';
import { CognitoAuthGateway } from './cognito-auth.gateway';

@Injectable()
export class AlbAuthGuard implements CanActivate {
  constructor(
    private readonly cognitoAuthGateway: CognitoAuthGateway,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.readHeader(request, 'x-amzn-oidc-accesstoken');
    const albIdentity = this.readHeader(request, 'x-amzn-oidc-identity');

    if (!accessToken || !albIdentity) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const cognitoSub = await this.cognitoAuthGateway.verifyAccessToken(accessToken);

    if (cognitoSub !== albIdentity) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const authIdentity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            nickname: true,
            profileImage: true,
            createdAt: true,
            isActive: true,
          },
        },
      },
    });

    if (!authIdentity?.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    request.authContext = {
      accessToken,
      user: {
        id: authIdentity.user.id,
        cognitoSub,
        email: authIdentity.user.email,
        nickname: authIdentity.user.nickname,
        profileImage: authIdentity.user.profileImage,
        createdAt: authIdentity.user.createdAt,
      },
    };

    return true;
  }

  private readHeader(request: AuthenticatedRequest, name: string): string | undefined {
    const value = request.headers[name];

    return typeof value === 'string' ? value : undefined;
  }
}
