import { Injectable } from '@nestjs/common';
import { GroupRole, NotificationType } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInternalNotificationDto } from './dto/create-internal-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationUsersService } from './notification-users.service';

@Injectable()
export class InternalNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationUsers: NotificationUsersService,
    private readonly notificationDelivery: NotificationDeliveryService,
  ) {}

  async createNotification(
    cognitoSub: string,
    dto: CreateInternalNotificationDto,
  ): Promise<NotificationResponseDto> {
    const actorUserId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const groupId = BigInt(dto.groupId);
    const targetUserId = BigInt(dto.userId);

    await this.assertGroupExists(groupId);
    await this.assertActorIsAdmin(groupId, actorUserId);
    await this.assertTargetIsActiveMember(groupId, targetUserId);

    const notification = await this.notificationDelivery.createNotification({
      userId: targetUserId,
      groupId,
      type: dto.type,
      refId: dto.refId === undefined ? null : BigInt(dto.refId),
      message: dto.message,
    });

    return this.toResponse(notification);
  }

  private async assertGroupExists(groupId: bigint): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { isDeleted: true },
    });

    if (!group || group.isDeleted) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }
  }

  private async assertActorIsAdmin(groupId: bigint, actorUserId: bigint): Promise<void> {
    const actor = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: actorUserId, groupId } },
      select: { role: true, leftAt: true },
    });

    if (!actor || actor.leftAt !== null || actor.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.NOTIFICATION_FORBIDDEN);
    }
  }

  private async assertTargetIsActiveMember(groupId: bigint, targetUserId: bigint): Promise<void> {
    const target = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
      select: { leftAt: true, user: { select: { isActive: true } } },
    });

    if (!target || target.leftAt !== null || !target.user.isActive) {
      throw new BusinessException(ErrorCode.NOTIFICATION_TARGET_NOT_FOUND);
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
