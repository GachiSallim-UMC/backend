import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { CreateInternalNotificationDto } from './dto/create-internal-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { InternalNotificationsService } from './internal-notifications.service';

@ApiTags('알림')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(NotificationResponseDto)
@UseGuards(CognitoAccessTokenGuard)
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly internalNotifications: InternalNotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '내부 알림 생성' })
  @ApiBody({ type: CreateInternalNotificationDto })
  @ApiCreatedResponse({
    description: '내부 알림 생성 성공',
    schema: {
      type: 'object',
      required: ['statusCode', 'data', 'error'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        data: { $ref: getSchemaPath(NotificationResponseDto) },
        error: { type: 'object', nullable: true, example: null },
      },
    },
  })
  @ApiResponse({ status: 400, description: '알림 정보가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '그룹 관리자가 아닙니다.' })
  @ApiResponse({ status: 404, description: '그룹 또는 대상 사용자를 찾을 수 없습니다.' })
  createNotification(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateInternalNotificationDto,
  ): Promise<NotificationResponseDto> {
    return this.internalNotifications.createNotification(auth.cognitoSub, dto);
  }
}
