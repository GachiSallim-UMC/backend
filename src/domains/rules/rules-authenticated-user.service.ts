import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RulesAuthenticatedUserService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveUserId(cognitoSub: string): Promise<bigint> {
    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: { user: { select: { id: true, isActive: true } } },
    });

    if (!identity) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    }

    if (!identity.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    return identity.user.id;
  }
}
