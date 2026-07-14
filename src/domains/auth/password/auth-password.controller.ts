import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { AlbAuthGuard } from '../core/alb-auth.guard';
import { CurrentAccessToken } from '../core/current-auth.decorator';
import { AuthPasswordService } from './auth-password.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';

@ApiTags('auth')
@ApiSecurity('AlbSession')
@UseGuards(AlbAuthGuard)
@Controller('auth/password')
export class AuthPasswordController {
  constructor(private readonly authPasswordService: AuthPasswordService) {}

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '비밀번호 변경' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: '비밀번호 변경 성공', type: ChangePasswordResponseDto })
  @ApiResponse({
    status: 400,
    description: '기존 비밀번호가 올바르지 않거나 새 비밀번호 정책을 위반했습니다.',
  })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 502, description: 'Cognito 요청에 실패했습니다.' })
  changePassword(
    @CurrentAccessToken() accessToken: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    return this.authPasswordService.changePassword(accessToken, changePasswordDto);
  }
}
