import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationListResponseDto } from './dto/notification-list-response.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { UnreadNotificationCountResponseDto } from './dto/unread-notification-count-response.dto';
import { NotificationUsersService } from './notification-users.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationUsers: NotificationUsersService,
  ) {}

  async listNotifications(cognitoSub: string): Promise<NotificationListResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return { notifications: notifications.map((notification) => this.toResponse(notification)) };
  }

  async getUnreadCount(cognitoSub: string): Promise<UnreadNotificationCountResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { unreadCount };
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
