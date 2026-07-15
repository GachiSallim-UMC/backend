import {
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';

@Injectable()
export class PasswordService {
  constructor(
    @Inject(COGNITO_IDP_CLIENT)
    private readonly cognitoClient: CognitoIdentityProviderClient,
  ) {}

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

  private validatePasswordPolicy(previousPassword: string, newPassword: string): void {
    if (!/^\S{1,256}$/.test(previousPassword)) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER);
    }

    const satisfiesPolicy =
      /^\S{8,256}$/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /\d/.test(newPassword);

    if (!satisfiesPolicy || previousPassword === newPassword) {
      throw new BusinessException(ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION);
    }
  }

  private async mapCognitoError(error: unknown, accessToken: string): Promise<BusinessException> {
    const errorName = error instanceof Error ? error.name : undefined;

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
}
