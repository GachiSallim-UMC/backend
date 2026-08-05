import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { ReadAllNotificationsResponseDto } from './dto/read-all-notifications-response.dto';
import { ReadNotificationResponseDto } from './dto/read-notification-response.dto';
import { UnreadNotificationCountResponseDto } from './dto/unread-notification-count-response.dto';
import { NotificationUsersService } from './notification-users.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationUsers: NotificationUsersService,
  ) {}

  async listNotifications(
    cognitoSub: string,
    groupId: number,
  ): Promise<NotificationListResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const notifications = await this.prisma.notification.findMany({
      where: { userId, groupId: BigInt(groupId), hiddenAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return { notifications: notifications.map((notification) => this.toResponse(notification)) };
  }

  async getUnreadCount(
    cognitoSub: string,
    groupId: number,
  ): Promise<UnreadNotificationCountResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const unreadCount = await this.prisma.notification.count({
      where: { userId, groupId: BigInt(groupId), isRead: false, hiddenAt: null },
    });

    return { unreadCount };
  }

  async readNotification(
    cognitoSub: string,
    notificationId: bigint,
  ): Promise<ReadNotificationResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, hiddenAt: null },
      data: { isRead: true },
    });

    this.assertNotificationUpdated(result.count);

    return { notificationId: Number(notificationId), isRead: true };
  }

  async readAllNotifications(
    cognitoSub: string,
    groupId: number,
  ): Promise<ReadAllNotificationsResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const result = await this.prisma.notification.updateMany({
      where: { userId, groupId: BigInt(groupId), isRead: false, hiddenAt: null },
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }

  async hideNotification(cognitoSub: string, notificationId: bigint): Promise<void> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, hiddenAt: null },
      data: { hiddenAt: new Date() },
    });

    this.assertNotificationUpdated(result.count);
  }

  private assertNotificationUpdated(count: number): void {
    if (count !== 1) {
      throw new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND);
    }
  }

  private toResponse(notification: NotificationRecord): NotificationResponseDto {
    return {
      notificationId: Number(notification.id),
      groupId: notification.groupId === null ? null : Number(notification.groupId),
      type: notification.type,
      refId: notification.refId === null ? null : Number(notification.refId),
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}

interface NotificationRecord {
  id: bigint;
  groupId: bigint | null;
  type: NotificationType;
  refId: bigint | null;
  message: string;
  isRead: boolean;
  createdAt: Date;
}
