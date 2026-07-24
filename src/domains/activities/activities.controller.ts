import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { AuthContext } from '../auth/common/auth-context.interface';

@ApiTags('최근 활동 내역 (ACT)')
@ApiBearerAuth('BearerAuth')
@UseGuards(CognitoAccessTokenGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ACT-LIST-01: 활동 목록 조회 및 타임라인 상세 라우팅 (인증 및 그룹 권한 검증 적용)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '그룹 최근 활동 목록 조회 (ACT-LIST-01)' })
  @ApiResponse({ status: 200, description: '활동 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증되지 않은 사용자' })
  @ApiResponse({ status: 403, description: '해당 그룹에 접근 권한이 없음' })
  async getActivities(
    @CurrentAuth() auth: AuthContext,
    @Query() query: GetActivityQueryDto,
  ) {
    // 1. 요청한 유저가 query.groupId의 활성 멤버인지 권한 검증
    await this.activitiesService.validateGroupMembership(auth.cognitoSub, query.groupId);

    // 2. 활동 목록 조회 실행
    return this.activitiesService.getActivities(query);
  }
}