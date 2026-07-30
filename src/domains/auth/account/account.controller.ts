import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { SkipResponseWrap } from '../../../common/decorators/skip-response-wrap.decorator';
import { AuthContext } from '../common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../common/cognito-access-token.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import { AuthAccountService } from './account.service';
import { AuthAccountResponseDto } from './dto/auth-account-response.dto';
import { CreateProfileImageUploadDto } from './dto/create-profile-image-upload.dto';
import { DeleteAuthAccountResponseDto } from './dto/delete-auth-account-response.dto';
import { ProfileImageUploadResponseDto } from './dto/profile-image-upload-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileImageService } from './profile-image.service';

@ApiTags('인증')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(AuthAccountResponseDto, DeleteAuthAccountResponseDto, ProfileImageUploadResponseDto)
@UseGuards(CognitoAccessTokenGuard)
@Controller('auth')
export class AuthAccountController {
  constructor(
    private readonly accountService: AuthAccountService,
    private readonly profileImages: ProfileImageService,
  ) {}

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

  @Get('me/data-export')
  @HttpCode(HttpStatus.OK)
  @SkipResponseWrap()
  @ApiOperation({
    summary: '내 데이터 CSV 내보내기',
    description:
      '인증된 사용자가 담당·생성·완료한 집안일, 생성·결제·분담에 참여한 정산, 본인이 주체인 활동 내역을 CSV 파일로 내려받습니다.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'UTF-8 BOM이 포함된 CSV 파일',
    headers: {
      'Content-Disposition': {
        description: 'attachment; filename="gachisallim-my-data-YYYY-MM-DD.csv"',
        schema: { type: 'string' },
      },
    },
    content: {
      'text/csv': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  async exportMyData(@CurrentAuth() auth: AuthContext): Promise<StreamableFile> {
    const file = await this.accountService.exportMyData(auth.cognitoSub);

    return new StreamableFile(file.content, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${file.filename}"`,
      length: file.content.length,
    });
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '프로필 수정',
    description: '이름, 닉네임 또는 프로필 이미지를 수정합니다.',
  })
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

  @Post('profile-image/upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '프로필 이미지 업로드 URL 발급',
    description:
      '최대 5MB의 JPEG, PNG 또는 WebP 파일을 업로드할 수 있는 S3 Presigned POST를 발급합니다.',
  })
  @ApiBody({ type: CreateProfileImageUploadDto })
  @ApiCreatedResponse({
    description: '프로필 이미지 업로드 URL 발급 성공',
    schema: successSchema(ProfileImageUploadResponseDto, 201),
  })
  @ApiResponse({ status: 400, description: '파일 형식 또는 크기가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  createProfileImageUpload(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateProfileImageUploadDto,
  ): Promise<ProfileImageUploadResponseDto> {
    return this.profileImages.createUpload(auth.cognitoSub, dto);
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

function successSchema(
  model:
    | typeof AuthAccountResponseDto
    | typeof DeleteAuthAccountResponseDto
    | typeof ProfileImageUploadResponseDto,
  statusCode = 200,
) {
  return {
    type: 'object',
    required: ['statusCode', 'data', 'error'],
    properties: {
      statusCode: { type: 'integer', example: statusCode },
      data: { $ref: getSchemaPath(model) },
      error: { type: 'object', nullable: true, example: null },
    },
  };
}
