import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthContext } from '../common/auth-context.interface';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  LoginResponseDto,
  LogoutResponseDto,
  RefreshTokenResponseDto,
} from './dto/session-response.dto';

@Injectable()
export class AuthSessionService {
  private readonly cognitoClientId: string;

  constructor(
    @Inject(COGNITO_IDP_CLIENT) private readonly cognitoClient: CognitoIdentityProviderClient,
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.cognitoClientId = configService.getOrThrow<string>('COGNITO_CLIENT_ID');
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    let response: InitiateAuthCommandOutput;

    try {
      response = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: this.cognitoClientId,
          AuthParameters: {
            USERNAME: dto.email,
            PASSWORD: dto.password,
          },
        }),
      );
    } catch (error) {
      this.throwLoginError(error);
    }

    const authenticationResult = response.AuthenticationResult;
    if (
      !authenticationResult?.AccessToken ||
      !authenticationResult.IdToken ||
      !authenticationResult.RefreshToken ||
      authenticationResult.ExpiresIn === undefined ||
      !authenticationResult.TokenType
    ) {
      throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }

    const cognitoSub = this.parseSubject(authenticationResult.AccessToken);
    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      include: { user: true },
    });

    if (!identity) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    if (!identity.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    await this.prisma.userAuthIdentity.update({
      where: { id: identity.id },
      data: { lastAuthenticatedAt: new Date() },
    });

    return {
      accessToken: authenticationResult.AccessToken,
      idToken: authenticationResult.IdToken,
      refreshToken: authenticationResult.RefreshToken,
      expiresIn: authenticationResult.ExpiresIn,
      tokenType: authenticationResult.TokenType,
    };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    let response: InitiateAuthCommandOutput;

    try {
      response = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: this.cognitoClientId,
          AuthParameters: {
            REFRESH_TOKEN: dto.refreshToken,
          },
        }),
      );
    } catch (error) {
      this.throwAuthenticatedRequestError(error);
    }

    const authenticationResult = response.AuthenticationResult;
    if (
      !authenticationResult?.AccessToken ||
      !authenticationResult.IdToken ||
      authenticationResult.ExpiresIn === undefined ||
      !authenticationResult.TokenType
    ) {
      throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }

    return {
      accessToken: authenticationResult.AccessToken,
      idToken: authenticationResult.IdToken,
      expiresIn: authenticationResult.ExpiresIn,
      tokenType: authenticationResult.TokenType,
    };
  }

  async logout(auth: AuthContext): Promise<LogoutResponseDto> {
    try {
      await this.cognitoClient.send(new GlobalSignOutCommand({ AccessToken: auth.accessToken }));
    } catch (error) {
      this.throwAuthenticatedRequestError(error);
    }

    return { signedOut: true };
  }

  private parseSubject(accessToken: string): string {
    try {
      const segments = accessToken.split('.');
      if (segments.length !== 3 || !segments[1]) {
        throw new Error('Invalid JWT');
      }

      const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as unknown;
      if (!this.hasSubject(payload)) {
        throw new Error('Missing subject');
      }

      return payload.sub;
    } catch {
      throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
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

  private throwLoginError(error: unknown): never {
    const errorName = this.getErrorName(error);

    if (
      errorName === 'NotAuthorizedException' ||
      errorName === 'UserNotFoundException' ||
      errorName === 'PasswordResetRequiredException'
    ) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    if (errorName === 'UserNotConfirmedException') {
      throw new BusinessException(ErrorCode.AUTH_EMAIL_NOT_CONFIRMED);
    }

    this.throwProviderError(errorName);
  }

  private throwAuthenticatedRequestError(error: unknown): never {
    const errorName = this.getErrorName(error);

    if (errorName === 'NotAuthorizedException' || errorName === 'UserNotFoundException') {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    this.throwProviderError(errorName);
  }

  private throwProviderError(errorName: string | undefined): never {
    if (errorName === 'TooManyRequestsException' || errorName === 'LimitExceededException') {
      throw new BusinessException(ErrorCode.AUTH_TOO_MANY_REQUESTS);
    }

    throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
  }

  private getErrorName(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      typeof error.name === 'string'
      ? error.name
      : undefined;
  }
}
