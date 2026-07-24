import { ConfigService } from '@nestjs/config';
import { ChoreStatus, NotificationType } from '@prisma/client';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import { ChoreDueCommandConsumer } from './chore-due-command.consumer';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('ChoreDueCommandConsumer', () => {
  const findChore = jest.fn();
  const findMembership = jest.fn();
  const createNotification = jest.fn();
  const send = jest.fn();
  const prisma = {
    chore: { findUnique: findChore },
    groupMember: { findUnique: findMembership },
  } as unknown as PrismaService;
  const delivery = { createNotification } as unknown as NotificationDeliveryService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://sqs.example.com/command'),
    get: jest.fn((key: string, fallback?: unknown) => (key === 'NODE_ENV' ? 'test' : fallback)),
  } as unknown as ConfigService;
  const consumer = new ChoreDueCommandConsumer(prisma, delivery, config, {
    send,
  } as unknown as SQSClient);

  beforeEach(() => {
    jest.clearAllMocks();
    findChore.mockResolvedValue({
      id: 11n,
      groupId: 3n,
      title: '설거지',
      assigneeId: 5n,
      dueDate: new Date('2026-07-20T00:00:00.000Z'),
      status: ChoreStatus.PENDING,
      assignee: { isActive: true },
    });
    findMembership.mockResolvedValue({ leftAt: null });
    createNotification.mockResolvedValue({ id: 101n });
    send.mockImplementation((command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        return Promise.resolve({
          Messages: [{ Body: JSON.stringify(commandBody()), ReceiptHandle: 'receipt-1' }],
        });
      }
      return Promise.resolve({});
    });
  });

  it('revalidates DB state and creates an idempotent CHORE_DUE notification', async () => {
    await expect(consumer.consumeCommands()).resolves.toBe(1);

    expect(createNotification).toHaveBeenCalledWith({
      userId: 5n,
      groupId: 3n,
      type: NotificationType.CHORE_DUE,
      refId: 11n,
      message: '설거지 할 일 마감일입니다.',
      dedupeKey: 'CHORE_DUE:11:2026-07-20',
    });
    expect(send.mock.calls.some(([command]) => command instanceof DeleteMessageCommand)).toBe(true);
  });

  it.each([
    ['completed', { status: ChoreStatus.DONE }],
    ['reassigned', { assigneeId: 6n }],
    ['due date changed', { dueDate: new Date('2026-07-21T00:00:00.000Z') }],
  ])('acknowledges but ignores a stale command when the chore is %s', async (_case, change) => {
    findChore.mockResolvedValue({
      id: 11n,
      groupId: 3n,
      title: '설거지',
      assigneeId: 5n,
      dueDate: new Date('2026-07-20T00:00:00.000Z'),
      status: ChoreStatus.PENDING,
      assignee: { isActive: true },
      ...change,
    });

    await expect(consumer.consumeCommands()).resolves.toBe(1);

    expect(createNotification).not.toHaveBeenCalled();
    expect(send.mock.calls.some(([command]) => command instanceof DeleteMessageCommand)).toBe(true);
  });

  function commandBody() {
    return {
      version: 1,
      type: 'CHORE_DUE',
      choreId: '11',
      expectedDueDate: '2026-07-20',
      expectedAssigneeId: '5',
    };
  }
});
