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
      return await this.prisma.$transaction((transaction) =>
        this.createNotificationInTransaction(transaction, input),
      );
    } catch (error) {
      if (input.dedupeKey && this.isUniqueConstraintViolation(error)) {
        return this.prisma.notification.findUniqueOrThrow({
          where: { dedupeKey: input.dedupeKey },
        });
      }
      throw error;
    }
  }

  async createNotificationInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    if (input.dedupeKey) {
      const existing = await transaction.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (existing) return existing;
    }

    const preference = await transaction.userNotificationPreference.findUnique({
      where: { userId: input.userId },
      select: NOTIFICATION_DELIVERY_PREFERENCE_SELECT,
    });
    const subscriptions = this.isPushEnabled(input, preference)
      ? await transaction.notificationPushSubscription.findMany({
          where: { userId: input.userId, isActive: true },
          select: { id: true },
        })
      : [];

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
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isPushEnabled(
    input: CreateNotificationInput,
    preference: NotificationDeliveryPreference | null,
  ): boolean {
    if (!preference) {
      return true;
    }
    if (input.groupId !== null && !preference.groupActivityEnabled) {
      return false;
    }

    switch (input.type) {
      case NotificationType.CHORE_DUE:
        return preference.choreDueEnabled;
      case NotificationType.SUPPLY_LOW:
        return preference.supplyStatusChangedEnabled;
      case NotificationType.NEW_MESSAGE:
        return preference.newMessageEnabled;
      case NotificationType.EXPENSE_REQUEST:
        return preference.expenseRequestEnabled;
      case NotificationType.RULE_CHANGED:
        return preference.ruleAgreementRequestEnabled;
      default:
        return true;
    }
  }
}

const NOTIFICATION_DELIVERY_PREFERENCE_SELECT = {
  choreDueEnabled: true,
  supplyStatusChangedEnabled: true,
  newMessageEnabled: true,
  expenseRequestEnabled: true,
  ruleAgreementRequestEnabled: true,
  groupActivityEnabled: true,
} satisfies Prisma.UserNotificationPreferenceSelect;

type NotificationDeliveryPreference = Prisma.UserNotificationPreferenceGetPayload<{
  select: typeof NOTIFICATION_DELIVERY_PREFERENCE_SELECT;
}>;
