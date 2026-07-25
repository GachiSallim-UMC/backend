import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';
import {
  RequestPasswordResetDto,
  RequestPasswordResetResponseDto,
} from './dto/request-password-reset.dto';
import { ResetPasswordDto, ResetPasswordResponseDto } from './dto/reset-password.dto';
import { PasswordService } from './password.service';

@ApiTags('인증')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '비밀번호 재설정 이메일 요청',
    description:
      '계정 존재 여부를 노출하지 않고 Cognito를 통해 비밀번호 재설정 이메일을 요청합니다.',
  })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({
    status: 200,
    description: '비밀번호 재설정 이메일 요청 접수',
    type: RequestPasswordResetResponseDto,
  })
  @ApiResponse({ status: 429, description: '인증 서비스 요청 제한 초과' })
  @ApiResponse({ status: 502, description: '인증 서비스 처리 오류' })
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<RequestPasswordResetResponseDto> {
    return this.passwordService.requestPasswordReset(dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '비밀번호 재설정',
    description: '이메일로 받은 Cognito 인증 코드와 새 비밀번호로 비밀번호를 재설정합니다.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: '비밀번호 재설정 성공',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: '인증 코드 오류·만료 또는 비밀번호 정책 위반' })
  @ApiResponse({ status: 429, description: '인증 서비스 요청 제한 초과' })
  @ApiResponse({ status: 502, description: '인증 서비스 처리 오류' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResponseDto> {
    return this.passwordService.resetPassword(dto);
  }

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CognitoAccessTokenGuard)
  @ApiBearerAuth('BearerAuth')
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
