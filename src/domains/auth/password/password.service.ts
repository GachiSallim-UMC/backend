import {
  ChangePasswordCommand,
  ConfirmForgotPasswordCommand,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { AUTH_PASSWORD_PATTERN } from '../common/password-policy.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';
import { ChangePasswordWithConfirmationDto } from './dto/change-password-with-confirmation.dto';
import {
  RequestPasswordResetDto,
  RequestPasswordResetResponseDto,
} from './dto/request-password-reset.dto';
import { ResetPasswordDto, ResetPasswordResponseDto } from './dto/reset-password.dto';

@Injectable()
export class PasswordService {
  private readonly cognitoClientId: string;
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @Inject(COGNITO_IDP_CLIENT)
    private readonly cognitoClient: CognitoIdentityProviderClient,
    configService: ConfigService,
  ) {
    this.cognitoClientId = configService.getOrThrow<string>('COGNITO_CLIENT_ID');
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
  ): Promise<RequestPasswordResetResponseDto> {
    try {
      await this.cognitoClient.send(
        new ForgotPasswordCommand({
          ClientId: this.cognitoClientId,
          Username: dto.email,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Password reset email request failed: ${this.getErrorName(error) ?? 'UnknownError'}`,
      );
    }

    return { accepted: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    this.validateNewPassword(dto.newPassword);

    try {
      await this.cognitoClient.send(
        new ConfirmForgotPasswordCommand({
          ClientId: this.cognitoClientId,
          Username: dto.email,
          ConfirmationCode: dto.confirmationCode,
          Password: dto.newPassword,
        }),
      );
    } catch (error) {
      throw this.mapPasswordResetError(error);
    }

    return { reset: true };
  }

  async changePassword(
    accessToken: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    const { previousPassword, newPassword } = changePasswordDto;
    this.validatePasswordPolicy(previousPassword, newPassword);

    try {
      await this.cognitoClient.send(
        new ChangePasswordCommand({
          AccessToken: accessToken,
          PreviousPassword: previousPassword,
          ProposedPassword: newPassword,
        }),
      );
    } catch (error) {
      throw await this.mapCognitoError(error, accessToken);
    }

    return { changed: true };
  }

  async changePasswordWithConfirmation(
    accessToken: string,
    dto: ChangePasswordWithConfirmationDto,
  ): Promise<ChangePasswordResponseDto> {
    const { currentPassword, newPassword, newPasswordConfirmation } = dto;

    if (newPassword !== newPasswordConfirmation) {
      throw new BusinessException(ErrorCode.AUTH_PASSWORD_CONFIRMATION_MISMATCH);
    }

    return this.changePassword(accessToken, {
      previousPassword: currentPassword,
      newPassword,
    });
  }

  private validatePasswordPolicy(previousPassword: string, newPassword: string): void {
    if (!/^\S{1,256}$/.test(previousPassword)) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER);
    }

    this.validateNewPassword(newPassword);
    if (previousPassword === newPassword) {
      throw new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
    }
  }

  private validateNewPassword(newPassword: string): void {
    if (!AUTH_PASSWORD_PATTERN.test(newPassword)) {
      throw new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
    }
  }

  private mapPasswordResetError(error: unknown): BusinessException {
    switch (this.getErrorName(error)) {
      case 'CodeMismatchException':
      case 'InvalidParameterException':
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        return new BusinessException(ErrorCode.AUTH_INVALID_CONFIRMATION_CODE);
      case 'ExpiredCodeException':
        return new BusinessException(ErrorCode.AUTH_EXPIRED_CONFIRMATION_CODE);
      case 'InvalidPasswordException':
      case 'PasswordHistoryPolicyViolationException':
        return new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
      case 'LimitExceededException':
      case 'TooManyFailedAttemptsException':
      case 'TooManyRequestsException':
        return new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
      default:
        return new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }
  }

  private async mapCognitoError(error: unknown, accessToken: string): Promise<BusinessException> {
    const errorName = this.getErrorName(error);

    switch (errorName) {
      case 'NotAuthorizedException':
        return this.classifyNotAuthorized(accessToken);
      case 'InvalidParameterException':
      case 'InvalidPasswordException':
      case 'PasswordHistoryPolicyViolationException':
        return new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
      case 'LimitExceededException':
      case 'TooManyFailedAttemptsException':
      case 'TooManyRequestsException':
        return new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
      default:
        return new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }
  }

  private async classifyNotAuthorized(accessToken: string): Promise<BusinessException> {
    try {
      await this.cognitoClient.send(new GetUserCommand({ AccessToken: accessToken }));
      return new BusinessException(ErrorCode.AUTH_CURRENT_PASSWORD_INVALID);
    } catch (error) {
      switch (error instanceof Error ? error.name : undefined) {
        case 'NotAuthorizedException':
        case 'UserNotFoundException':
          return new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          return new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
        default:
          return new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
      }
    }
  }

  private getErrorName(error: unknown): string | undefined {
    return error instanceof Error ? error.name : undefined;
  }
}
