import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
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
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushSubscriptionListResponseDto } from './dto/push-subscription-list-response.dto';
import { PushSubscriptionResponseDto } from './dto/push-subscription-response.dto';
import { VapidPublicKeyResponseDto } from './dto/vapid-public-key-response.dto';
import { NotificationPushSubscriptionsService } from './notification-push-subscriptions.service';
import { VapidPublicKeyService } from './vapid-public-key.service';

@ApiTags('알림')
@ApiBearerAuth('BearerAuth')
@ApiExtraModels(
  PushSubscriptionListResponseDto,
  PushSubscriptionResponseDto,
  VapidPublicKeyResponseDto,
)
@UseGuards(CognitoAccessTokenGuard)
@Controller('notification-push-subscriptions')
export class NotificationPushSubscriptionsController {
  constructor(
    private readonly pushSubscriptions: NotificationPushSubscriptionsService,
    private readonly vapidPublicKey: VapidPublicKeyService,
  ) {}

  @Get('vapid-public-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '웹 푸시 구독용 VAPID 공개 키 조회' })
  @ApiOkResponse({ schema: successSchema(VapidPublicKeyResponseDto, 200) })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  getVapidPublicKey(): Promise<VapidPublicKeyResponseDto> {
    return this.vapidPublicKey.getPublicKey();
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '웹 푸시 구독 목록 조회' })
  @ApiOkResponse({ schema: successSchema(PushSubscriptionListResponseDto, 200) })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  listSubscriptions(@CurrentAuth() auth: AuthContext): Promise<PushSubscriptionListResponseDto> {
    return this.pushSubscriptions.listSubscriptions(auth.cognitoSub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '웹 푸시 구독 등록' })
  @ApiBody({ type: CreatePushSubscriptionDto })
  @ApiCreatedResponse({ schema: successSchema(PushSubscriptionResponseDto, 201) })
  @ApiResponse({ status: 400, description: '구독 정보가 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  registerSubscription(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<PushSubscriptionResponseDto> {
    return this.pushSubscriptions.registerSubscription(auth.cognitoSub, dto, userAgent);
  }

  @Delete(':subscriptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '웹 푸시 구독 해지' })
  @ApiParam({ name: 'subscriptionId', type: Number, example: 15 })
  @ApiNoContentResponse({ description: '웹 푸시 구독 해지 성공' })
  @ApiResponse({ status: 400, description: '구독 ID 형식이 올바르지 않습니다.' })
  @ApiResponse({ status: 401, description: '인증 토큰이 없거나 올바르지 않습니다.' })
  @ApiResponse({ status: 404, description: '구독을 찾을 수 없습니다.' })
  revokeSubscription(
    @CurrentAuth() auth: AuthContext,
    @Param('subscriptionId') subscriptionId: string,
  ): Promise<void> {
    return this.pushSubscriptions.revokeSubscription(
      auth.cognitoSub,
      parseBigIntId(subscriptionId, 'subscriptionId'),
    );
  }
}

function successSchema(
  model:
    | typeof PushSubscriptionListResponseDto
    | typeof PushSubscriptionResponseDto
    | typeof VapidPublicKeyResponseDto,
  statusCode: number,
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
