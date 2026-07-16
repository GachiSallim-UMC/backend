import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushSubscriptionListResponseDto } from './dto/push-subscription-list-response.dto';
import { PushSubscriptionResponseDto } from './dto/push-subscription-response.dto';
import { NotificationUsersService } from './notification-users.service';

const PUSH_SUBSCRIPTION_SELECT = {
  id: true,
  endpoint: true,
  userAgent: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationPushSubscriptionSelect;

type PushSubscriptionRecord = Prisma.NotificationPushSubscriptionGetPayload<{
  select: typeof PUSH_SUBSCRIPTION_SELECT;
}>;

@Injectable()
export class NotificationPushSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationUsers: NotificationUsersService,
  ) {}

  async listSubscriptions(cognitoSub: string): Promise<PushSubscriptionListResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const subscriptions = await this.prisma.notificationPushSubscription.findMany({
      where: { userId, isActive: true },
      select: PUSH_SUBSCRIPTION_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return { subscriptions: subscriptions.map((subscription) => this.toResponse(subscription)) };
  }

  async registerSubscription(
    cognitoSub: string,
    dto: CreatePushSubscriptionDto,
    userAgent?: string,
  ): Promise<PushSubscriptionResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const subscription = await this.prisma.notificationPushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: userAgent ?? null,
      },
      update: {
        userId,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: userAgent ?? null,
        isActive: true,
        revokedAt: null,
      },
      select: PUSH_SUBSCRIPTION_SELECT,
    });

    return this.toResponse(subscription);
  }

  async revokeSubscription(cognitoSub: string, subscriptionId: bigint): Promise<void> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const result = await this.prisma.notificationPushSubscription.updateMany({
      where: { id: subscriptionId, userId, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new BusinessException(ErrorCode.NOTIFICATION_SUBSCRIPTION_NOT_FOUND);
    }
  }

  private toResponse(subscription: PushSubscriptionRecord): PushSubscriptionResponseDto {
    return {
      subscriptionId: Number(subscription.id),
      endpoint: subscription.endpoint,
      userAgent: subscription.userAgent,
      isActive: subscription.isActive,
      lastUsedAt: subscription.lastUsedAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  }
}
