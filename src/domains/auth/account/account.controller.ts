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
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { AuthAccountService } from './account.service';
import { AuthAccountResponseDto } from './dto/auth-account-response.dto';
import { DeleteAuthAccountResponseDto } from './dto/delete-auth-account-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('인증')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(AuthAccountResponseDto, DeleteAuthAccountResponseDto)
@UseGuards(CognitoAccessTokenGuard)
@Controller('auth')
export class AuthAccountController {
  constructor(private readonly accountService: AuthAccountService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '내 정보 조회', description: '인증된 사용자의 계정 정보를 조회합니다.' })
  @ApiOkResponse({
    description: '내 정보 조회 성공',
    schema: successSchema(AuthAccountResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  getAccount(@CurrentAuth() auth: AuthContext): Promise<AuthAccountResponseDto> {
    return this.accountService.getAccount(auth.cognitoSub);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '프로필 수정', description: '닉네임 또는 프로필 이미지를 수정합니다.' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ description: '프로필 수정 성공', schema: successSchema(AuthAccountResponseDto) })
  @ApiResponse({ status: 400, description: '요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthAccountResponseDto> {
    return this.accountService.updateProfile(auth.cognitoSub, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '회원 탈퇴',
    description: '로컬 계정과 Cognito 사용자를 비활성화·삭제합니다.',
  })
  @ApiOkResponse({
    description: '회원 탈퇴 성공',
    schema: successSchema(DeleteAuthAccountResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  @ApiResponse({ status: 500, description: '계정 복구에 실패했습니다.' })
  @ApiResponse({ status: 502, description: 'Cognito 사용자 삭제에 실패했습니다.' })
  deleteAccount(@CurrentAuth() auth: AuthContext): Promise<DeleteAuthAccountResponseDto> {
    return this.accountService.deleteAccount(auth.cognitoSub, auth.accessToken);
  }
}

function successSchema(model: typeof AuthAccountResponseDto | typeof DeleteAuthAccountResponseDto) {
  return {
    type: 'object',
    required: ['statusCode', 'data', 'error'],
    properties: {
      statusCode: { type: 'integer', example: 200 },
      data: { $ref: getSchemaPath(model) },
      error: { type: 'object', nullable: true, example: null },
    },
  };
}
