import {
  CognitoIdentityProviderClient,
  DeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { AuthAccountResponseDto } from './dto/auth-account-response.dto';
import { DeleteAuthAccountResponseDto } from './dto/delete-auth-account-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COGNITO_IDP_CLIENT) private readonly cognitoClient: CognitoIdentityProviderClient,
  ) {}

  async getAccount(cognitoSub: string): Promise<AuthAccountResponseDto> {
    const account = await this.findActiveAccount(cognitoSub);

    return this.toResponse(account.user);
  }

  async updateProfile(cognitoSub: string, dto: UpdateProfileDto): Promise<AuthAccountResponseDto> {
    if (dto.nickname === undefined && dto.profileImage === undefined) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER);
    }

    const account = await this.findActiveAccount(cognitoSub);
    const user = await this.prisma.user.update({
      where: { id: account.user.id },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.profileImage !== undefined ? { profileImage: dto.profileImage } : {}),
      },
      select: ACCOUNT_USER_SELECT,
    });

    return this.toResponse(user);
  }

  async deleteAccount(
    cognitoSub: string,
    accessToken: string,
  ): Promise<DeleteAuthAccountResponseDto> {
    const account = await this.findActiveAccount(cognitoSub);

    const transition = await this.prisma.user.updateMany({
      where: { id: account.user.id, isActive: true },
      data: { isActive: false },
    });

    if (transition.count !== 1) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    try {
      await this.cognitoClient.send(new DeleteUserCommand({ AccessToken: accessToken }));
    } catch {
      await this.restoreAccount(account.user.id);
      throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }

    return { userId: Number(account.user.id), deleted: true };
  }

  private async findActiveAccount(cognitoSub: string): Promise<AuthAccountRecord> {
    const account = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: { user: { select: ACCOUNT_USER_SELECT } },
    });

    if (!account) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    }

    if (!account.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    return account;
  }

  private async restoreAccount(userId: bigint): Promise<void> {
    try {
      const transition = await this.prisma.user.updateMany({
        where: { id: userId, isActive: false },
        data: { isActive: true },
      });

      if (transition.count !== 1) {
        throw new Error('Account state changed before compensation');
      }
    } catch {
      throw new BusinessException(ErrorCode.AUTH_COMPENSATION_FAILED);
    }
  }

  private toResponse(user: AccountUser): AuthAccountResponseDto {
    return {
      userId: Number(user.id),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      profileImage: user.profileImage,
    };
  }
}

const ACCOUNT_USER_SELECT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  profileImage: true,
  isActive: true,
} as const;

interface AccountUser {
  id: bigint;
  name: string;
  nickname: string;
  email: string;
  profileImage: string | null;
  isActive: boolean;
}

interface AuthAccountRecord {
  user: AccountUser;
}
