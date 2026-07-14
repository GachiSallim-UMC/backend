import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiWrappedSuccessResponse } from '../../../common/decorators/api-wrapped-success-response.decorator';
import { AuthUserResponseDto } from '../core/auth-user-response.dto';
import { AuthSignupService } from './auth-signup.service';
import { SignupDto } from './dto/signup.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthSignupController {
  constructor(private readonly authSignupService: AuthSignupService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '회원가입', description: 'Cognito 사용자와 서비스 계정을 생성합니다.' })
  @ApiBody({ type: SignupDto })
  @ApiWrappedSuccessResponse({
    status: HttpStatus.CREATED,
    description: '회원가입 성공',
    type: AuthUserResponseDto,
  })
  @ApiResponse({ status: 400, description: '요청 내용이 유효하지 않습니다.' })
  @ApiResponse({ status: 409, description: '이미 가입된 이메일입니다.' })
  @ApiResponse({ status: 502, description: '인증 제공자 요청에 실패했습니다.' })
  signup(@Body() dto: SignupDto): Promise<AuthUserResponseDto> {
    return this.authSignupService.signup(dto);
  }
}
