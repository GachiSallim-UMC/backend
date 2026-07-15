import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthContext } from './auth-context.interface';
import { AuthenticatedRequest } from './authenticated-request.interface';

@Injectable()
export class CognitoAccessTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.auth = this.parseAuthorization(request.headers.authorization);

    return true;
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
}
