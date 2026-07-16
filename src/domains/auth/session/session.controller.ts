import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  LoginResponseDto,
  LogoutResponseDto,
  RefreshTokenResponseDto,
} from './dto/session-response.dto';
import { AuthSessionService } from './session.service';

@ApiTags('인증')
@Controller('auth')
export class AuthSessionController {
  constructor(private readonly authSessionService: AuthSessionService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그인',
    description: '이메일과 비밀번호로 Cognito 세션을 생성합니다.',
  })
  @ApiResponse({ status: 200, description: '로그인 성공', type: LoginResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호가 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 409, description: '이메일 확인이 필요합니다.' })
  @ApiResponse({ status: 429, description: '요청이 너무 많습니다.' })
  @ApiResponse({ status: 502, description: '인증 서비스 요청을 처리하지 못했습니다.' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authSessionService.login(dto);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '인증 토큰 갱신',
    description: 'Cognito refresh token으로 세션 토큰을 갱신합니다.',
  })
  @ApiResponse({ status: 200, description: '토큰 갱신 성공', type: RefreshTokenResponseDto })
  @ApiResponse({ status: 400, description: '요청 파라미터가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '유효한 refresh token이 아닙니다.' })
  @ApiResponse({ status: 429, description: '요청이 너무 많습니다.' })
  @ApiResponse({ status: 502, description: '인증 서비스 요청을 처리하지 못했습니다.' })
  refreshToken(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.authSessionService.refreshToken(dto);
  }

  @Post('logout')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: '로그아웃',
    description: '현재 Cognito access token으로 모든 세션을 종료합니다.',
  })
  @ApiResponse({ status: 200, description: '로그아웃 성공', type: LogoutResponseDto })
  @ApiResponse({ status: 401, description: '유효한 access token이 아닙니다.' })
  @ApiResponse({ status: 429, description: '요청이 너무 많습니다.' })
  @ApiResponse({ status: 502, description: '인증 서비스 요청을 처리하지 못했습니다.' })
  logout(@CurrentAuth() auth: AuthContext): Promise<LogoutResponseDto> {
    return this.authSessionService.logout(auth);
  }
}
