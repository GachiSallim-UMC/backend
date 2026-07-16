import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ConfirmSignupDto, ConfirmSignupResponseDto } from './dto/confirm-signup.dto';
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
}
