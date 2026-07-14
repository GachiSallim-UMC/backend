import { Controller, Headers, HttpStatus, Post, Redirect, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { SkipResponseWrap } from '../../../common/decorators/skip-response-wrap.decorator';
import { AlbAuthGuard } from '../core/alb-auth.guard';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { CurrentAccessToken } from '../core/current-auth.decorator';

const ALB_AUTH_COOKIE_PREFIX = 'AWSELBAuthSessionCookie';
const EXPIRED_COOKIE_ATTRIBUTES =
  'Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None';

@ApiTags('AUTH')
@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly cognitoAuthGateway: CognitoAuthGateway,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @Redirect('/api/v1/auth/me', HttpStatus.SEE_OTHER)
  @SkipResponseWrap()
  @ApiOperation({ summary: 'Managed Login 시작' })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description: 'ALB 인증을 시작하기 위해 보호된 내 정보 API로 이동합니다.',
  })
  login(): void {}

  @Post('logout')
  @UseGuards(AlbAuthGuard)
  @SkipResponseWrap()
  @ApiSecurity('AlbSession')
  @ApiOperation({ summary: '로그아웃' })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Cognito 세션을 종료하고 허용된 로그아웃 URI로 이동합니다.',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: '인증이 필요합니다.' })
  async logout(
    @CurrentAccessToken() accessToken: string,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const expiredCookies = this.getAlbAuthCookieNames(cookieHeader).map(
      (cookieName) => `${cookieName}=; ${EXPIRED_COOKIE_ATTRIBUTES}`,
    );

    try {
      await this.cognitoAuthGateway.globalSignOut(accessToken);
    } finally {
      if (expiredCookies.length > 0) {
        response.setHeader('Set-Cookie', expiredCookies);
      }
    }

    response.redirect(HttpStatus.FOUND, this.getCognitoLogoutUrl());
  }

  private getAlbAuthCookieNames(cookieHeader: string | undefined): string[] {
    if (!cookieHeader) {
      return [];
    }

    const cookieNames = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim().split('=', 1)[0])
      .filter((cookieName) => cookieName.startsWith(ALB_AUTH_COOKIE_PREFIX));

    return [...new Set(cookieNames)];
  }

  private getCognitoLogoutUrl(): string {
    const domain = this.configService.getOrThrow<string>('COGNITO_DOMAIN');
    const clientId = this.configService.getOrThrow<string>('COGNITO_USER_POOL_CLIENT_ID');
    const logoutRedirectUri = this.configService.getOrThrow<string>('AUTH_LOGOUT_REDIRECT_URI');
    const logoutUrl = new URL('/logout', domain);

    logoutUrl.searchParams.set('client_id', clientId);
    logoutUrl.searchParams.set('logout_uri', logoutRedirectUri);

    return logoutUrl.toString();
  }
}
