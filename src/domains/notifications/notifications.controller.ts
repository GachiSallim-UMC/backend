import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import { NotificationGroupQueryDto } from './dto/notification-group-query.dto';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { NotificationPreferencesResponseDto } from './dto/notification-preferences-response.dto';
import { ReadAllNotificationsResponseDto } from './dto/read-all-notifications-response.dto';
import { ReadNotificationResponseDto } from './dto/read-notification-response.dto';
import { UnreadNotificationCountResponseDto } from './dto/unread-notification-count-response.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsService } from './notifications.service';

@ApiTags('알림')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(
  NotificationListResponseDto,
  NotificationPreferencesResponseDto,
  UnreadNotificationCountResponseDto,
  ReadNotificationResponseDto,
  ReadAllNotificationsResponseDto,
)
@UseGuards(CognitoAccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationPreferences: NotificationPreferencesService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '알림 목록 조회' })
  @ApiOkResponse({
    description: '알림 목록 조회 성공',
    schema: successSchema(NotificationListResponseDto),
  })
  @ApiResponse({ status: 400, description: '그룹 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  listNotifications(
    @CurrentAuth() auth: AuthContext,
    @Query() query: NotificationGroupQueryDto,
  ): Promise<NotificationListResponseDto> {
    return this.notificationsService.listNotifications(auth.cognitoSub, query.groupId);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '미읽음 알림 개수 조회' })
  @ApiOkResponse({
    description: '미읽음 알림 개수 조회 성공',
    schema: successSchema(UnreadNotificationCountResponseDto),
  })
  @ApiResponse({ status: 400, description: '그룹 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  getUnreadCount(
    @CurrentAuth() auth: AuthContext,
    @Query() query: NotificationGroupQueryDto,
  ): Promise<UnreadNotificationCountResponseDto> {
    return this.notificationsService.getUnreadCount(auth.cognitoSub, query.groupId);
  }

  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '알림 설정 조회' })
  @ApiOkResponse({
    description: '알림 설정 조회 성공',
    schema: successSchema(NotificationPreferencesResponseDto),
  })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  getPreferences(@CurrentAuth() auth: AuthContext): Promise<NotificationPreferencesResponseDto> {
    return this.notificationPreferences.getPreferences(auth.cognitoSub);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '알림 설정 수정',
    description:
      '전달된 설정만 수정합니다. 비활성화한 유형도 앱 내 알림은 유지하고 웹 푸시만 중단합니다.',
  })
  @ApiBody({ type: UpdateNotificationPreferencesDto })
  @ApiOkResponse({
    description: '알림 설정 수정 성공',
    schema: successSchema(NotificationPreferencesResponseDto),
  })
  @ApiResponse({ status: 400, description: '요청 파라미터가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 403, description: '비활성화된 계정입니다.' })
  @ApiResponse({ status: 404, description: '인증 계정 정보를 찾을 수 없습니다.' })
  updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.notificationPreferences.updatePreferences(auth.cognitoSub, dto);
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
  @ApiResponse({ status: 400, description: '그룹 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  readAllNotifications(
    @CurrentAuth() auth: AuthContext,
    @Query() query: NotificationGroupQueryDto,
  ): Promise<ReadAllNotificationsResponseDto> {
    return this.notificationsService.readAllNotifications(auth.cognitoSub, query.groupId);
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
    | typeof NotificationPreferencesResponseDto
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
