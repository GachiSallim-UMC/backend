import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { ChoreDueCommandV1 } from './chore-due-command.interface';
import { CHORE_DUE_SCHEDULER_CLIENT, CHORE_DUE_SQS_CLIENT } from './chore-due-scheduler.constants';

interface SchedulableChore {
  id: bigint;
  assigneeId: bigint;
  dueDate: Date | null;
}

@Injectable()
export class ChoreDueSchedulerService {
  private readonly queueUrl: string;
  private readonly queueArn: string;
  private readonly deadLetterQueueArn: string;
  private readonly groupName: string;
  private readonly roleArn: string;
  private readonly schedulePrefix: string;
  private readonly notificationTime: string;
  private readonly timeZone: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CHORE_DUE_SCHEDULER_CLIENT) private readonly scheduler: SchedulerClient,
    @Inject(CHORE_DUE_SQS_CLIENT) private readonly sqs: SQSClient,
  ) {
    this.queueUrl = config.getOrThrow<string>('NOTIFICATION_COMMAND_QUEUE_URL');
    this.queueArn = config.getOrThrow<string>('NOTIFICATION_COMMAND_QUEUE_ARN');
    this.deadLetterQueueArn = config.getOrThrow<string>('NOTIFICATION_COMMAND_DLQ_ARN');
    this.groupName = config.getOrThrow<string>('CHORE_DUE_SCHEDULE_GROUP');
    this.roleArn = config.getOrThrow<string>('CHORE_DUE_SCHEDULE_ROLE_ARN');
    this.schedulePrefix = config.getOrThrow<string>('CHORE_DUE_SCHEDULE_PREFIX');
    this.notificationTime = config.get<string>('CHORE_DUE_NOTIFICATION_TIME', '09:00');
    this.timeZone = config.get<string>('CHORE_DUE_TIME_ZONE', 'Asia/Seoul');
  }

  async synchronize(chore: SchedulableChore): Promise<void> {
    if (!chore.dueDate) {
      await this.delete(chore.id);
      return;
    }

    const command = this.toCommand(chore);
    if (this.notificationInstant(command.expectedDueDate).getTime() <= Date.now()) {
      await this.delete(chore.id);
      await this.sqs.send(
        new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(command) }),
      );
      return;
    }

    const input = {
      Name: this.scheduleName(chore.id),
      GroupName: this.groupName,
      ScheduleExpression: `at(${command.expectedDueDate}T${this.notificationTime}:00)`,
      ScheduleExpressionTimezone: this.timeZone,
      FlexibleTimeWindow: { Mode: 'OFF' as const },
      ActionAfterCompletion: 'DELETE' as const,
      State: 'ENABLED' as const,
      Target: {
        Arn: this.queueArn,
        RoleArn: this.roleArn,
        Input: JSON.stringify(command),
        DeadLetterConfig: { Arn: this.deadLetterQueueArn },
        RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 3 },
      },
    };

    try {
      await this.scheduler.send(new CreateScheduleCommand(input));
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }
      await this.scheduler.send(new UpdateScheduleCommand(input));
    }
  }

  async delete(choreId: bigint): Promise<void> {
    try {
      await this.scheduler.send(
        new DeleteScheduleCommand({ Name: this.scheduleName(choreId), GroupName: this.groupName }),
      );
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
    }
  }

  private toCommand(chore: SchedulableChore): ChoreDueCommandV1 {
    return {
      version: 1,
      type: 'CHORE_DUE',
      choreId: chore.id.toString(),
      expectedDueDate: chore.dueDate!.toISOString().slice(0, 10),
      expectedAssigneeId: chore.assigneeId.toString(),
    };
  }

  private scheduleName(choreId: bigint): string {
    return `chore-due-${this.schedulePrefix}-${choreId.toString()}`;
  }

  private notificationInstant(date: string): Date {
    const desired = Date.parse(`${date}T${this.notificationTime}:00Z`);
    let instant = new Date(desired);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = Object.fromEntries(
        formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
      );
      const observed = Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
      );
      instant = new Date(instant.getTime() + desired - observed);
    }
    return instant;
  }
}
