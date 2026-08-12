import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';

import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { GetDashboardQueryDto } from './dto/get-dashboard-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(DashboardResponseDto)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dashboard summary 조회 (DASH-VIEW-01)',
    description:
      '그룹의 대시보드 정보를 조회합니다. 오늘의 집안일, 미정산 금액, 부족한 공용 물품, 안 읽은 메시지, 최근 활동, 미정산 항목 목록을 함께 반환합니다.',
  })
  @ApiQuery({ name: 'groupId', required: true, type: Number, description: '조회할 그룹 ID' })
  @ApiOkResponse({
    description: 'Dashboard summary 조회 성공',
    schema: successSchema(DashboardResponseDto),
  })
  @ApiResponse({ status: 400, description: 'COMMON_400 - 잘못된 파라미터입니다.' })
  @ApiResponse({ status: 401, description: 'COMMON_401 - 인증되지 않았습니다.' })
  getDashboard(
    @CurrentAuth() auth: AuthContext,
    @Query() query: GetDashboardQueryDto,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(auth.cognitoSub, query.groupId);
  }
}

function successSchema(model: typeof DashboardResponseDto) {
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
