import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { parseBigIntId } from '../../common/utils/id.util';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { ReadAllNotificationsResponseDto } from './dto/read-all-notifications-response.dto';
import { ReadNotificationResponseDto } from './dto/read-notification-response.dto';
import { UnreadNotificationCountResponseDto } from './dto/unread-notification-count-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('알림')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(
  NotificationListResponseDto,
  UnreadNotificationCountResponseDto,
  ReadNotificationResponseDto,
  ReadAllNotificationsResponseDto,
)
@UseGuards(CognitoAccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '알림 목록 조회' })
  @ApiOkResponse({
    description: '알림 목록 조회 성공',
    schema: successSchema(NotificationListResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  listNotifications(@CurrentAuth() auth: AuthContext): Promise<NotificationListResponseDto> {
    return this.notificationsService.listNotifications(auth.cognitoSub);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '미읽음 알림 개수 조회' })
  @ApiOkResponse({
    description: '미읽음 알림 개수 조회 성공',
    schema: successSchema(UnreadNotificationCountResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  getUnreadCount(@CurrentAuth() auth: AuthContext): Promise<UnreadNotificationCountResponseDto> {
    return this.notificationsService.getUnreadCount(auth.cognitoSub);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '단일 알림 읽음 처리' })
  @ApiParam({ name: 'notificationId', type: Number, example: 101 })
  @ApiOkResponse({
    description: '알림 읽음 처리 성공',
    schema: successSchema(ReadNotificationResponseDto),
  })
  @ApiResponse({ status: 400, description: '알림 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 404, description: '알림을 찾을 수 없습니다.' })
  readNotification(
    @CurrentAuth() auth: AuthContext,
    @Param('notificationId') notificationId: string,
  ): Promise<ReadNotificationResponseDto> {
    return this.notificationsService.readNotification(
      auth.cognitoSub,
      parseBigIntId(notificationId, 'notificationId'),
    );
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '전체 알림 읽음 처리' })
  @ApiOkResponse({
    description: '전체 알림 읽음 처리 성공',
    schema: successSchema(ReadAllNotificationsResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  readAllNotifications(@CurrentAuth() auth: AuthContext): Promise<ReadAllNotificationsResponseDto> {
    return this.notificationsService.readAllNotifications(auth.cognitoSub);
  }

  @Delete(':notificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '알림 숨김 처리' })
  @ApiParam({ name: 'notificationId', type: Number, example: 101 })
  @ApiNoContentResponse({ description: '알림 숨김 처리 성공' })
  @ApiResponse({ status: 400, description: '알림 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 404, description: '알림을 찾을 수 없습니다.' })
  hideNotification(
    @CurrentAuth() auth: AuthContext,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    return this.notificationsService.hideNotification(
      auth.cognitoSub,
      parseBigIntId(notificationId, 'notificationId'),
    );
  }
}

function successSchema(
  model:
    | typeof NotificationListResponseDto
    | typeof UnreadNotificationCountResponseDto
    | typeof ReadNotificationResponseDto
    | typeof ReadAllNotificationsResponseDto,
) {
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
