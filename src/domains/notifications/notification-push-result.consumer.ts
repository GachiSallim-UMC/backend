import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPushDeliveryStatus } from '@prisma/client';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationPushResultOutcome,
  NotificationPushResultV1,
} from './notification-push-result.interface';
import { NOTIFICATION_SQS_CLIENT } from './notification-sqs.constants';

@Injectable()
export class NotificationPushResultConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationPushResultConsumer.name);
  private readonly queueUrl: string;
  private readonly pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private consuming = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_SQS_CLIENT) private readonly sqs: SQSClient,
  ) {
    this.queueUrl = this.config.getOrThrow<string>('NOTIFICATION_PUSH_RESULT_QUEUE_URL');
    this.pollIntervalMs = this.config.get<number>('NOTIFICATION_RESULT_POLL_INTERVAL_MS', 5000);
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }

    void this.consumeResults();
    this.timer = setInterval(() => void this.consumeResults(), this.pollIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async consumeResults(): Promise<number> {
    if (this.consuming) {
      return 0;
    }

    this.consuming = true;
    try {
      const response = await this.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        }),
      );
      let consumedCount = 0;
      for (const message of response.Messages ?? []) {
        try {
          const result = this.parseResult(message.Body);
          await this.applyResult(result);
          await this.sqs.send(
            new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }),
          );
          consumedCount += 1;
        } catch (error) {
          this.logger.warn(`Notification push result processing failed: ${this.errorName(error)}`);
        }
      }
      return consumedCount;
    } finally {
      this.consuming = false;
    }
  }

  private async applyResult(result: NotificationPushResultV1): Promise<void> {
    const deliveryId = BigInt(result.deliveryId);
    const subscriptionId = BigInt(result.subscriptionId);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const update = await transaction.notificationPushDelivery.updateMany({
        where: {
          id: deliveryId,
          subscriptionId,
          status: NotificationPushDeliveryStatus.ENQUEUED,
        },
        data: this.deliveryUpdate(result.outcome, result.errorCode, now),
      });
      if (update.count === 0) {
        return;
      }

      if (result.outcome === 'SENT') {
        await transaction.notificationPushSubscription.updateMany({
          where: { id: subscriptionId, isActive: true },
          data: { lastUsedAt: now },
        });
      } else if (result.outcome === 'EXPIRED') {
        await transaction.notificationPushSubscription.updateMany({
          where: { id: subscriptionId, isActive: true },
          data: { isActive: false, revokedAt: now },
        });
      }
    });
  }

  private deliveryUpdate(
    outcome: NotificationPushResultOutcome,
    errorCode: string | undefined,
    now: Date,
  ) {
    if (outcome === 'SENT') {
      return {
        status: NotificationPushDeliveryStatus.SENT,
        sentAt: now,
        lastError: null,
      };
    }

    return {
      status: NotificationPushDeliveryStatus.FAILED,
      failedAt: now,
      lastError: (errorCode ?? outcome).slice(0, 255),
    };
  }

  private parseResult(body: string | undefined): NotificationPushResultV1 {
    if (!body) {
      throw new Error('RESULT_BODY_REQUIRED');
    }
    const result = JSON.parse(body) as Partial<NotificationPushResultV1>;
    if (
      result.version !== 1 ||
      !this.isPositiveInteger(result.deliveryId) ||
      !this.isPositiveInteger(result.subscriptionId) ||
      !['SENT', 'EXPIRED', 'FAILED'].includes(result.outcome ?? '')
    ) {
      throw new Error('RESULT_BODY_INVALID');
    }
    return result as NotificationPushResultV1;
  }

  private isPositiveInteger(value: unknown): value is string {
    return typeof value === 'string' && /^[1-9]\d*$/.test(value);
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  }
}
