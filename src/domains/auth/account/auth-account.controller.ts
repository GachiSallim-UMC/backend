import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { AlbAuthGuard } from '../core/alb-auth.guard';
import { AuthenticatedUser } from '../core/auth-context.interface';
import { AuthUserResponseDto } from '../core/auth-user-response.dto';
import { CurrentAccessToken, CurrentUser } from '../core/current-auth.decorator';
import { AuthAccountService } from './auth-account.service';
import { UpdateAuthProfileDto } from './dto/update-auth-profile.dto';
import { WithdrawAuthAccountResponseDto } from './dto/withdraw-auth-account-response.dto';

@ApiTags('auth')
@ApiSecurity('AlbSession')
@UseGuards(AlbAuthGuard)
@Controller('auth')
export class AuthAccountController {
  constructor(private readonly authAccountService: AuthAccountService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '내 정보 조회', description: '인증된 사용자의 계정 정보를 조회합니다.' })
  @ApiResponse({ status: 200, description: '내 정보 조회 성공', type: AuthUserResponseDto })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  getMe(@CurrentUser() user: AuthenticatedUser): AuthUserResponseDto {
    return this.authAccountService.getMe(user);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '프로필 수정', description: '닉네임 또는 프로필 이미지를 수정합니다.' })
  @ApiBody({ type: UpdateAuthProfileDto })
  @ApiResponse({ status: 200, description: '프로필 수정 성공', type: AuthUserResponseDto })
  @ApiResponse({ status: 400, description: '수정할 프로필 정보가 없거나 형식이 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAuthProfileDto,
  ): Promise<AuthUserResponseDto> {
    return this.authAccountService.updateProfile(user, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '회원 탈퇴',
    description: '사용자를 비활성화하고 Cognito 계정을 삭제합니다.',
  })
  @ApiResponse({ status: 200, description: '회원 탈퇴 성공', type: WithdrawAuthAccountResponseDto })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 502, description: '인증 제공자 요청에 실패했습니다.' })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAccessToken() accessToken: string,
  ): Promise<WithdrawAuthAccountResponseDto> {
    return this.authAccountService.withdraw(user, accessToken);
  }
}
