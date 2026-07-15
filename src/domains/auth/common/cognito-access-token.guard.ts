import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthContext } from './auth-context.interface';
import { AuthenticatedRequest } from './authenticated-request.interface';
import { COGNITO_IDP_CLIENT } from './cognito.constants';

@Injectable()
export class CognitoAccessTokenGuard implements CanActivate {
  constructor(
    @Inject(COGNITO_IDP_CLIENT)
    private readonly cognitoClient: CognitoIdentityProviderClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = this.parseAuthorization(request.headers.authorization);

    await this.verifyActiveToken(auth);
    request.auth = auth;

    return true;
  }

  private async verifyActiveToken(auth: AuthContext): Promise<void> {
    try {
      const response = await this.cognitoClient.send(
        new GetUserCommand({ AccessToken: auth.accessToken }),
      );
      const cognitoSub = response.UserAttributes?.find(
        (attribute) => attribute.Name === 'sub',
      )?.Value;

      if (cognitoSub !== auth.cognitoSub) {
        throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
      }
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      switch (this.getErrorName(error)) {
        case 'NotAuthorizedException':
        case 'UserNotFoundException':
        case 'UserNotConfirmedException':
          throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
        default:
          throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
      }
    }
  }

  private parseAuthorization(authorization: string | undefined): AuthContext {
    if (!authorization) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const accessToken = parts[1];

    try {
      const segments = accessToken.split('.');
      if (segments.length !== 3 || !segments[1]) {
        throw new Error('Invalid JWT');
      }

      const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as unknown;
      if (!this.hasSubject(payload)) {
        throw new Error('Missing subject');
      }

      return { cognitoSub: payload.sub, accessToken };
    } catch {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }
  }

  private hasSubject(payload: unknown): payload is { sub: string } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'sub' in payload &&
      typeof payload.sub === 'string' &&
      payload.sub.length > 0
    );
  }

  private getErrorName(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : undefined;
  }
}
