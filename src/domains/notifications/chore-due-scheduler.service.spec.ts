import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { ChoreDueSchedulerService } from './chore-due-scheduler.service';

describe('ChoreDueSchedulerService', () => {
  const schedulerSend = jest.fn<Promise<unknown>, [unknown]>();
  const sqsSend = jest.fn<Promise<unknown>, [unknown]>();
  const values: Record<string, string> = {
    NOTIFICATION_COMMAND_QUEUE_URL: 'https://sqs.example.com/command',
    NOTIFICATION_COMMAND_QUEUE_ARN: 'arn:aws:sqs:ap-northeast-2:123:command',
    NOTIFICATION_COMMAND_DLQ_ARN: 'arn:aws:sqs:ap-northeast-2:123:command-dlq',
    CHORE_DUE_SCHEDULE_GROUP: 'gachisallim-develop-chore-due',
    CHORE_DUE_SCHEDULE_ROLE_ARN: 'arn:aws:iam::123:role/scheduler',
    CHORE_DUE_SCHEDULE_PREFIX: 'develop',
    CHORE_DUE_NOTIFICATION_TIME: '09:00',
    CHORE_DUE_TIME_ZONE: 'Asia/Seoul',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
  const service = new ChoreDueSchedulerService(
    config,
    { send: schedulerSend } as unknown as SchedulerClient,
    { send: sqsSend } as unknown as SQSClient,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    schedulerSend.mockResolvedValue({});
    sqsSend.mockResolvedValue({ MessageId: 'message-1' });
    jest.useFakeTimers({ now: new Date('2026-07-18T00:00:00.000Z') });
  });

  afterEach(() => jest.useRealTimers());

  it('creates a one-time schedule with cleanup, retry and command payload', async () => {
    await service.synchronize({
      id: 11n,
      assigneeId: 5n,
      dueDate: new Date('2026-07-20T00:00:00.000Z'),
    });

    const command = schedulerSend.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(CreateScheduleCommand);
    expect((command as CreateScheduleCommand).input).toMatchObject({
      Name: 'chore-due-develop-11',
      GroupName: 'gachisallim-develop-chore-due',
      ScheduleExpression: 'at(2026-07-20T09:00:00)',
      ScheduleExpressionTimezone: 'Asia/Seoul',
      FlexibleTimeWindow: { Mode: 'OFF' },
      ActionAfterCompletion: 'DELETE',
      Target: {
        Arn: values.NOTIFICATION_COMMAND_QUEUE_ARN,
        RoleArn: values.CHORE_DUE_SCHEDULE_ROLE_ARN,
        DeadLetterConfig: { Arn: values.NOTIFICATION_COMMAND_DLQ_ARN },
        RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 3 },
      },
    });
    expect(JSON.parse((command as CreateScheduleCommand).input.Target?.Input ?? '')).toEqual({
      version: 1,
      type: 'CHORE_DUE',
      choreId: '11',
      expectedDueDate: '2026-07-20',
      expectedAssigneeId: '5',
    });
  });

  it('updates the deterministic schedule after a create conflict', async () => {
    schedulerSend
      .mockRejectedValueOnce(
        new ConflictException({ $metadata: {}, message: 'exists', Message: 'exists' }),
      )
      .mockResolvedValueOnce({});

    await service.synchronize({
      id: 11n,
      assigneeId: 6n,
      dueDate: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(schedulerSend.mock.calls[1]?.[0]).toBeInstanceOf(UpdateScheduleCommand);
  });

  it('immediately enqueues a due command when the configured time has passed', async () => {
    jest.setSystemTime(new Date('2026-07-18T02:00:00.000Z'));

    await service.synchronize({
      id: 11n,
      assigneeId: 5n,
      dueDate: new Date('2026-07-18T00:00:00.000Z'),
    });

    expect(schedulerSend.mock.calls[0]?.[0]).toBeInstanceOf(DeleteScheduleCommand);
    expect(sqsSend.mock.calls[0]?.[0]).toBeInstanceOf(SendMessageCommand);
    expect(sqsSend.mock.invocationCallOrder[0]).toBeLessThan(
      schedulerSend.mock.invocationCallOrder[0],
    );
  });

  it('keeps the schedule when immediate command publication fails', async () => {
    jest.setSystemTime(new Date('2026-07-18T02:00:00.000Z'));
    sqsSend.mockRejectedValue(new Error('temporary SQS failure'));

    await expect(
      service.synchronize({
        id: 11n,
        assigneeId: 5n,
        dueDate: new Date('2026-07-18T00:00:00.000Z'),
      }),
    ).rejects.toThrow('temporary SQS failure');

    expect(schedulerSend).not.toHaveBeenCalled();
  });
});
