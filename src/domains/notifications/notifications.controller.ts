import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { UnreadNotificationCountResponseDto } from './dto/unread-notification-count-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('알림')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(NotificationListResponseDto, UnreadNotificationCountResponseDto)
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
}

function successSchema(
  model: typeof NotificationListResponseDto | typeof UnreadNotificationCountResponseDto,
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
