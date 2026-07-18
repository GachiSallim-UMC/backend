import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPushDeliveryStatus, Prisma } from '@prisma/client';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPushJobV1 } from './notification-push-job.interface';
import { NOTIFICATION_SQS_CLIENT } from './notification-sqs.constants';

const DELIVERY_INCLUDE = {
  notification: true,
  subscription: true,
} satisfies Prisma.NotificationPushDeliveryInclude;

type DeliveryWithRelations = Prisma.NotificationPushDeliveryGetPayload<{
  include: typeof DELIVERY_INCLUDE;
}>;

@Injectable()
export class NotificationOutboxPublisher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationOutboxPublisher.name);
  private readonly queueUrl: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private timer?: NodeJS.Timeout;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_SQS_CLIENT) private readonly sqs: SQSClient,
  ) {
    this.queueUrl = this.config.getOrThrow<string>('NOTIFICATION_PUSH_QUEUE_URL');
    this.pollIntervalMs = this.config.get<number>('NOTIFICATION_OUTBOX_POLL_INTERVAL_MS', 5000);
    this.batchSize = this.config.get<number>('NOTIFICATION_OUTBOX_BATCH_SIZE', 10);
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }

    void this.publishPendingDeliveries();
    this.timer = setInterval(() => void this.publishPendingDeliveries(), this.pollIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async publishPendingDeliveries(): Promise<number> {
    if (this.publishing) {
      return 0;
    }

    this.publishing = true;
    try {
      const deliveries = await this.prisma.notificationPushDelivery.findMany({
        where: {
          status: NotificationPushDeliveryStatus.PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        include: DELIVERY_INCLUDE,
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
      });

      let publishedCount = 0;
      for (const delivery of deliveries) {
        if (!delivery.subscription.isActive) {
          await this.markInactive(delivery.id);
          continue;
        }

        if (await this.publishDelivery(delivery)) {
          publishedCount += 1;
        }
      }

      return publishedCount;
    } finally {
      this.publishing = false;
    }
  }

  private async publishDelivery(delivery: DeliveryWithRelations): Promise<boolean> {
    try {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(this.toJob(delivery)),
        }),
      );
      await this.prisma.notificationPushDelivery.updateMany({
        where: { id: delivery.id, status: NotificationPushDeliveryStatus.PENDING },
        data: {
          status: NotificationPushDeliveryStatus.ENQUEUED,
          publishAttempts: { increment: 1 },
          enqueuedAt: new Date(),
          lastError: null,
        },
      });
      return true;
    } catch (error) {
      const attempt = delivery.publishAttempts + 1;
      await this.prisma.notificationPushDelivery.updateMany({
        where: { id: delivery.id, status: NotificationPushDeliveryStatus.PENDING },
        data: {
          publishAttempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + this.retryDelayMs(attempt)),
          lastError: this.errorName(error),
        },
      });
      this.logger.warn(`Notification push delivery ${delivery.id.toString()} publish failed`);
      return false;
    }
  }

  private markInactive(deliveryId: bigint): Promise<unknown> {
    return this.prisma.notificationPushDelivery.updateMany({
      where: { id: deliveryId, status: NotificationPushDeliveryStatus.PENDING },
      data: {
        status: NotificationPushDeliveryStatus.FAILED,
        failedAt: new Date(),
        lastError: 'SUBSCRIPTION_INACTIVE',
      },
    });
  }

  private toJob(delivery: DeliveryWithRelations): NotificationPushJobV1 {
    return {
      version: 1,
      deliveryId: delivery.id.toString(),
      notification: {
        notificationId: delivery.notification.id.toString(),
        userId: delivery.notification.userId.toString(),
        groupId: delivery.notification.groupId?.toString() ?? null,
        type: delivery.notification.type,
        refId: delivery.notification.refId?.toString() ?? null,
        message: delivery.notification.message,
        createdAt: delivery.notification.createdAt.toISOString(),
      },
      subscription: {
        subscriptionId: delivery.subscription.id.toString(),
        endpoint: delivery.subscription.endpoint,
        keys: {
          p256dh: delivery.subscription.p256dhKey,
          auth: delivery.subscription.authKey,
        },
      },
    };
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(300_000, 1000 * 2 ** Math.min(attempt - 1, 8));
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 255) : 'UNKNOWN_ERROR';
  }
}
