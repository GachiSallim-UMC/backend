import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthUserResponseDto } from '../core/auth-user-response.dto';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthSignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cognitoAuthGateway: CognitoAuthGateway,
  ) {}

  async signup(dto: SignupDto): Promise<AuthUserResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
    }

    const cognitoSub = await this.cognitoAuthGateway.createConfirmedUser(dto.email, dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.nickname,
          nickname: dto.nickname,
          authIdentities: {
            create: {
              provider: 'COGNITO',
              cognitoSub,
              email: dto.email,
            },
          },
        },
        select: {
          id: true,
          email: true,
          nickname: true,
          profileImage: true,
          createdAt: true,
        },
      });

      return {
        id: user.id.toString(),
        email: user.email,
        nickname: user.nickname,
        profileImage: user.profileImage,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      try {
        await this.cognitoAuthGateway.deleteAdminUser(dto.email);
      } catch {
        // Preserve the database failure that triggered compensation.
      }

      throw error;
    }
  }
}
