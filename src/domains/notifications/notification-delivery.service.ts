import { Injectable } from '@nestjs/common';
import { Notification, NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationInput {
  userId: bigint;
  groupId: bigint | null;
  type: NotificationType;
  refId: bigint | null;
  message: string;
}

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  createNotification(input: CreateNotificationInput): Promise<Notification> {
    return this.prisma.$transaction(async (transaction) => {
      const subscriptions = await transaction.notificationPushSubscription.findMany({
        where: { userId: input.userId, isActive: true },
        select: { id: true },
      });

      return transaction.notification.create({
        data: {
          userId: input.userId,
          groupId: input.groupId,
          type: input.type,
          refId: input.refId,
          message: input.message,
          pushDeliveries: {
            create: subscriptions.map(({ id }) => ({ subscriptionId: id })),
          },
        },
      });
    });
  }
}
