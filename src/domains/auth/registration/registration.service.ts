import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetUserCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthAccountResponseDto } from '../account/dto/auth-account-response.dto';
import { AuthContext } from '../common/auth-context.interface';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { ConfirmSignupDto, ConfirmSignupResponseDto } from './dto/confirm-signup.dto';
import { SocialSignupDto } from './dto/social-signup.dto';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';

@Injectable()
export class AuthRegistrationService {
  constructor(
    @Inject(COGNITO_IDP_CLIENT)
    private readonly cognitoClient: CognitoIdentityProviderClient,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    const clientId = this.configService.getOrThrow<string>('COGNITO_CLIENT_ID');
    const userPoolId = this.configService.getOrThrow<string>('COGNITO_USER_POOL_ID');
    let cognitoSub: string;

    try {
      const response = await this.cognitoClient.send(
        new SignUpCommand({
          ClientId: clientId,
          Username: dto.email,
          Password: dto.password,
          UserAttributes: [
            { Name: 'email', Value: dto.email },
            { Name: 'name', Value: dto.name },
            { Name: 'nickname', Value: dto.nickname },
          ],
        }),
      );

      if (!response.UserSub) {
        throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
      }
      cognitoSub = response.UserSub;
    } catch (error) {
      if (this.getErrorName(error) === 'LimitExceededException') {
        await this.compensateSignup(userPoolId, dto.email);
        throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
      }

      this.throwSignupError(error);
    }

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            nickname: dto.nickname,
            isActive: false,
          },
        });

        await transaction.userAuthIdentity.create({
          data: {
            userId: createdUser.id,
            cognitoSub,
            provider: AuthProvider.COGNITO,
            email: dto.email,
          },
        });

        return createdUser;
      });

      return { userId: Number(user.id), email: user.email, confirmationRequired: true };
    } catch (databaseError) {
      await this.compensateSignup(userPoolId, dto.email);

      if (this.isUniqueConstraintError(databaseError)) {
        throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
      }

      throw databaseError;
    }
  }

  async confirmSignup(dto: ConfirmSignupDto): Promise<ConfirmSignupResponseDto> {
    const identity = await this.prisma.userAuthIdentity.findFirst({
      where: { email: dto.email, provider: AuthProvider.COGNITO },
      include: { user: true },
    });

    if (!identity) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    }

    if (identity.user.isActive) {
      return { userId: Number(identity.user.id), email: identity.email, confirmed: true };
    }

    try {
      await this.cognitoClient.send(
        new ConfirmSignUpCommand({
          ClientId: this.configService.getOrThrow<string>('COGNITO_CLIENT_ID'),
          Username: dto.email,
          ConfirmationCode: dto.confirmationCode,
        }),
      );
    } catch (error) {
      if (
        this.getErrorName(error) !== 'NotAuthorizedException' ||
        !(await this.isCognitoUserConfirmed(dto.email))
      ) {
        this.throwConfirmationError(error);
      }
    }

    const user = await this.prisma.user.update({
      where: { id: identity.userId },
      data: { isActive: true },
    });

    return { userId: Number(user.id), email: identity.email, confirmed: true };
  }

  async socialSignup(auth: AuthContext, dto: SocialSignupDto): Promise<AuthAccountResponseDto> {
    const socialIdentity = await this.getSocialIdentity(auth);
    const existingIdentity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub: auth.cognitoSub },
      include: { user: true },
    });

    if (existingIdentity) {
      this.assertActive(existingIdentity.user.isActive);
      return this.toAccountResponse(existingIdentity.user);
    }

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            email: socialIdentity.email,
            name: dto.name,
            nickname: dto.nickname,
            isActive: true,
          },
        });

        await transaction.userAuthIdentity.create({
          data: {
            userId: createdUser.id,
            cognitoSub: auth.cognitoSub,
            provider: socialIdentity.provider,
            providerUserId: socialIdentity.providerUserId,
            email: socialIdentity.email,
            lastAuthenticatedAt: new Date(),
          },
        });

        return createdUser;
      });

      return this.toAccountResponse(user);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentIdentity = await this.prisma.userAuthIdentity.findUnique({
        where: { cognitoSub: auth.cognitoSub },
        include: { user: true },
      });
      if (concurrentIdentity) {
        this.assertActive(concurrentIdentity.user.isActive);
        return this.toAccountResponse(concurrentIdentity.user);
      }

      throw new BusinessException(ErrorCode.AUTH_SOCIAL_ACCOUNT_LINK_REQUIRED);
    }
  }

  private async getSocialIdentity(auth: AuthContext): Promise<SocialIdentity> {
    let attributes: Record<string, string | undefined>;

    try {
      const response = await this.cognitoClient.send(
        new GetUserCommand({ AccessToken: auth.accessToken }),
      );
      attributes = {};
      for (const attribute of response.UserAttributes ?? []) {
        if (attribute.Name) {
          attributes[attribute.Name] = attribute.Value;
        }
      }
    } catch (error) {
      switch (this.getErrorName(error)) {
        case 'NotAuthorizedException':
        case 'UserNotFoundException':
          throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
        default:
          throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
      }
    }

    if (!attributes.email || attributes.email_verified !== 'true') {
      throw new BusinessException(ErrorCode.AUTH_SOCIAL_EMAIL_REQUIRED);
    }

    const identity = this.parseSupportedIdentity(attributes.identities);
    if (!identity) {
      throw new BusinessException(ErrorCode.AUTH_SOCIAL_PROVIDER_UNSUPPORTED);
    }

    return {
      email: attributes.email.trim().toLowerCase(),
      provider: identity.provider,
      providerUserId: identity.providerUserId,
    };
  }

  private parseSupportedIdentity(value: string | undefined): ParsedSocialIdentity | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const identities = JSON.parse(value) as unknown;
      if (!Array.isArray(identities)) {
        return undefined;
      }

      for (const identity of identities) {
        if (!this.hasProviderIdentity(identity)) {
          continue;
        }

        const provider = SOCIAL_PROVIDER_MAP[identity.providerName];
        if (provider) {
          return { provider, providerUserId: identity.userId };
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private hasProviderIdentity(value: unknown): value is ProviderIdentityClaim {
    return (
      typeof value === 'object' &&
      value !== null &&
      'providerName' in value &&
      typeof value.providerName === 'string' &&
      'userId' in value &&
      typeof value.userId === 'string' &&
      value.userId.length > 0
    );
  }

  private assertActive(isActive: boolean): void {
    if (!isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }
  }

  private toAccountResponse(user: SocialAccountUser): AuthAccountResponseDto {
    return {
      userId: Number(user.id),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      profileImage: user.profileImage ?? null,
    };
  }

  private async compensateSignup(userPoolId: string, username: string): Promise<void> {
    try {
      await this.cognitoClient.send(
        new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }),
      );
    } catch (error) {
      if (this.getErrorName(error) === 'UserNotFoundException') {
        return;
      }

      throw new BusinessException(ErrorCode.AUTH_COMPENSATION_FAILED);
    }
  }

  private async isCognitoUserConfirmed(username: string): Promise<boolean> {
    try {
      const response = await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: this.configService.getOrThrow<string>('COGNITO_USER_POOL_ID'),
          Username: username,
        }),
      );

      return response.UserStatus === 'CONFIRMED' && response.Enabled === true;
    } catch (error) {
      switch (this.getErrorName(error)) {
        case 'UserNotFoundException':
          throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
        default:
          throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
      }
    }
  }

  private throwSignupError(error: unknown): never {
    switch (this.getErrorName(error)) {
      case 'UsernameExistsException':
      case 'AliasExistsException':
        throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
      case 'InvalidPasswordException':
        throw new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
      case 'TooManyRequestsException':
        throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
      default:
        if (error instanceof BusinessException) {
          throw error;
        }
        throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }
  }

  private throwConfirmationError(error: unknown): never {
    switch (this.getErrorName(error)) {
      case 'CodeMismatchException':
        throw new BusinessException(ErrorCode.AUTH_INVALID_CONFIRMATION_CODE);
      case 'ExpiredCodeException':
        throw new BusinessException(ErrorCode.AUTH_EXPIRED_CONFIRMATION_CODE);
      case 'UserNotFoundException':
        throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
      case 'TooManyRequestsException':
      case 'LimitExceededException':
        throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
      default:
        throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }
  }

  private getErrorName(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : undefined;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}

const SOCIAL_PROVIDER_MAP: Partial<Record<string, AuthProvider>> = {
  Google: AuthProvider.GOOGLE,
  SignInWithApple: AuthProvider.APPLE,
  Kakao: AuthProvider.KAKAO,
};

interface ProviderIdentityClaim {
  providerName: string;
  userId: string;
}

interface ParsedSocialIdentity {
  provider: AuthProvider;
  providerUserId: string;
}

interface SocialIdentity extends ParsedSocialIdentity {
  email: string;
}

interface SocialAccountUser {
  id: bigint;
  name: string;
  nickname: string;
  email: string;
  profileImage?: string | null;
  isActive: boolean;
}
