import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthAccountResponseDto } from '../account/dto/auth-account-response.dto';
import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { ConfirmSignupDto, ConfirmSignupResponseDto } from './dto/confirm-signup.dto';
import { SocialSignupDto } from './dto/social-signup.dto';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';
import { AuthRegistrationService } from './registration.service';

@ApiTags('auth')
@Controller('auth')
export class AuthRegistrationController {
  constructor(private readonly registrationService: AuthRegistrationService) {}

  @Post('signup')
  @HttpCode(200)
  @ApiOperation({ summary: '회원가입' })
  @ApiOkResponse({ type: SignupResponseDto })
  @ApiBadRequestResponse({ description: '요청 또는 비밀번호 정책이 올바르지 않습니다.' })
  @ApiConflictResponse({ description: '이미 가입된 이메일입니다.' })
  @ApiBadGatewayResponse({ description: '인증 서비스 요청에 실패했습니다.' })
  signup(@Body() dto: SignupDto): Promise<SignupResponseDto> {
    return this.registrationService.signup(dto);
  }

  @Post('signup/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: '회원가입 이메일 확인' })
  @ApiOkResponse({ type: ConfirmSignupResponseDto })
  @ApiBadRequestResponse({ description: '확인 코드가 올바르지 않거나 만료되었습니다.' })
  @ApiBadGatewayResponse({ description: '인증 서비스 요청에 실패했습니다.' })
  confirmSignup(@Body() dto: ConfirmSignupDto): Promise<ConfirmSignupResponseDto> {
    return this.registrationService.confirmSignup(dto);
  }

  @Post('social/signup')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(200)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: '소셜 로그인 신규 사용자 등록' })
  @ApiOkResponse({ type: AuthAccountResponseDto })
  @ApiBadRequestResponse({ description: '소셜 로그인 정보 또는 요청이 올바르지 않습니다.' })
  @ApiConflictResponse({ description: '기존 계정에 소셜 로그인을 연결해야 합니다.' })
  @ApiBadGatewayResponse({ description: '인증 서비스 요청에 실패했습니다.' })
  socialSignup(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SocialSignupDto,
  ): Promise<AuthAccountResponseDto> {
    return this.registrationService.socialSignup(auth, dto);
  }
}
