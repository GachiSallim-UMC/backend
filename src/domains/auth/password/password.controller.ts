import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';
import { PasswordService } from './password.service';

@ApiTags('인증')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CognitoAccessTokenGuard)
  @ApiOperation({
    summary: '비밀번호 변경',
    description: '현재 Cognito access token과 기존 비밀번호로 새 비밀번호를 설정합니다.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Cognito access token (Bearer JWT)',
    required: true,
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: '비밀번호 변경 성공', type: ChangePasswordResponseDto })
  @ApiResponse({
    status: 400,
    description: '현재 비밀번호 오류 또는 새 비밀번호 정책 위반',
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않음' })
  @ApiResponse({ status: 429, description: '인증 서비스 요청 제한 초과' })
  @ApiResponse({ status: 502, description: '인증 서비스 처리 오류' })
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    return this.passwordService.changePassword(auth.accessToken, changePasswordDto);
  }
}
