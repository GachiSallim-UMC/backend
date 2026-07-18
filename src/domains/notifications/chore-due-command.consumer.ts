import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChoreStatus, NotificationType } from '@prisma/client';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import { ChoreDueCommandV1 } from './chore-due-command.interface';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NOTIFICATION_SQS_CLIENT } from './notification-sqs.constants';

@Injectable()
export class ChoreDueCommandConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ChoreDueCommandConsumer.name);
  private readonly queueUrl: string;
  private readonly pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private consuming = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_SQS_CLIENT) private readonly sqs: SQSClient,
  ) {
    this.queueUrl = config.getOrThrow<string>('NOTIFICATION_COMMAND_QUEUE_URL');
    this.pollIntervalMs = config.get<number>('NOTIFICATION_COMMAND_POLL_INTERVAL_MS', 5000);
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    void this.consumeCommands();
    this.timer = setInterval(() => void this.consumeCommands(), this.pollIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async consumeCommands(): Promise<number> {
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
          await this.process(this.parse(message.Body));
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          consumedCount += 1;
        } catch (error) {
          this.logger.warn(`Chore due command processing failed: ${this.errorName(error)}`);
        }
      }
      return consumedCount;
    } finally {
      this.consuming = false;
    }
  }

  private async process(command: ChoreDueCommandV1): Promise<void> {
    const choreId = BigInt(command.choreId);
    const assigneeId = BigInt(command.expectedAssigneeId);
    const chore = await this.prisma.chore.findUnique({
      where: { id: choreId },
      select: {
        id: true,
        groupId: true,
        title: true,
        assigneeId: true,
        dueDate: true,
        status: true,
        assignee: { select: { isActive: true } },
      },
    });
    if (
      !chore ||
      chore.status !== ChoreStatus.PENDING ||
      chore.assigneeId !== assigneeId ||
      !chore.assignee.isActive ||
      !chore.dueDate ||
      chore.dueDate.toISOString().slice(0, 10) !== command.expectedDueDate
    ) {
      return;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: assigneeId, groupId: chore.groupId } },
      select: { leftAt: true },
    });
    if (!membership || membership.leftAt) {
      return;
    }

    await this.delivery.createNotification({
      userId: assigneeId,
      groupId: chore.groupId,
      type: NotificationType.CHORE_DUE,
      refId: chore.id,
      message: `${chore.title} 할 일 마감일입니다.`,
      dedupeKey: `CHORE_DUE:${command.choreId}:${command.expectedDueDate}`,
    });
  }

  private parse(body: string | undefined): ChoreDueCommandV1 {
    if (!body) {
      throw new Error('CHORE_DUE_COMMAND_REQUIRED');
    }
    const command = JSON.parse(body) as Partial<ChoreDueCommandV1>;
    if (
      command.version !== 1 ||
      command.type !== 'CHORE_DUE' ||
      !this.isPositiveInteger(command.choreId) ||
      !this.isPositiveInteger(command.expectedAssigneeId) ||
      typeof command.expectedDueDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(command.expectedDueDate)
    ) {
      throw new Error('CHORE_DUE_COMMAND_INVALID');
    }
    return command as ChoreDueCommandV1;
  }

  private isPositiveInteger(value: unknown): value is string {
    return typeof value === 'string' && /^[1-9]\d*$/.test(value);
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  }
}
