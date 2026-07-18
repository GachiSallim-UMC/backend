import { Injectable } from '@nestjs/common';
import { Notification, NotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationInput {
  userId: bigint;
  groupId: bigint | null;
  type: NotificationType;
  refId: bigint | null;
  message: string;
  dedupeKey?: string;
}

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (input.dedupeKey) {
          const existing = await transaction.notification.findUnique({
            where: { dedupeKey: input.dedupeKey },
          });
          if (existing) {
            return existing;
          }
        }

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
            ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
            pushDeliveries: {
              create: subscriptions.map(({ id }) => ({ subscriptionId: id })),
            },
          },
        });
      });
    } catch (error) {
      if (input.dedupeKey && this.isUniqueConstraintViolation(error)) {
        return this.prisma.notification.findUniqueOrThrow({
          where: { dedupeKey: input.dedupeKey },
        });
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
