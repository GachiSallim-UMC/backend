import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedUser } from '../core/auth-context.interface';
import { AuthUserResponseDto, toAuthUserResponse } from '../core/auth-user-response.dto';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { UpdateAuthProfileDto } from './dto/update-auth-profile.dto';
import { WithdrawAuthAccountResponseDto } from './dto/withdraw-auth-account-response.dto';

@Injectable()
export class AuthAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cognitoAuthGateway: CognitoAuthGateway,
  ) {}

  getMe(user: AuthenticatedUser): AuthUserResponseDto {
    return toAuthUserResponse(user);
  }

  async updateProfile(
    user: AuthenticatedUser,
    dto: UpdateAuthProfileDto,
  ): Promise<AuthUserResponseDto> {
    if (dto.nickname === undefined && dto.profileImage === undefined) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname, name: dto.nickname } : {}),
        ...(dto.profileImage !== undefined ? { profileImage: dto.profileImage } : {}),
      },
    });

    return toAuthUserResponse({
      id: updatedUser.id,
      cognitoSub: user.cognitoSub,
      email: updatedUser.email,
      nickname: updatedUser.nickname,
      profileImage: updatedUser.profileImage,
      createdAt: updatedUser.createdAt,
    });
  }

  async withdraw(
    user: AuthenticatedUser,
    accessToken: string,
  ): Promise<WithdrawAuthAccountResponseDto> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    try {
      await this.cognitoAuthGateway.deleteUser(accessToken);
    } catch (error) {
      await this.prisma.user
        .update({
          where: { id: user.id },
          data: { isActive: true },
        })
        .catch(() => undefined);
      throw error;
    }

    return { withdrawn: true };
  }
}
