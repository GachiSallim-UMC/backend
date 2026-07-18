import { ConfigService } from '@nestjs/config';
import { NotificationPushDeliveryStatus, NotificationType, Prisma } from '@prisma/client';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationOutboxPublisher } from './notification-outbox.publisher';

describe('NotificationOutboxPublisher', () => {
  const findDeliveries = jest.fn();
  const updateDeliveries = jest.fn<
    Promise<Prisma.BatchPayload>,
    [Prisma.NotificationPushDeliveryUpdateManyArgs]
  >();
  const send = jest.fn<Promise<unknown>, [SendMessageCommand]>();
  const prisma = {
    notificationPushDelivery: {
      findMany: findDeliveries,
      updateMany: updateDeliveries,
    },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://sqs.example.com/push'),
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'NODE_ENV') return 'test';
      return fallback;
    }),
  } as unknown as ConfigService;
  const sqs = { send } as unknown as SQSClient;
  const publisher = new NotificationOutboxPublisher(prisma, config, sqs);
  const delivery = {
    id: 31n,
    notificationId: 101n,
    subscriptionId: 11n,
    status: NotificationPushDeliveryStatus.PENDING,
    publishAttempts: 0,
    nextAttemptAt: new Date('2026-07-18T00:00:00.000Z'),
    enqueuedAt: null,
    sentAt: null,
    failedAt: null,
    lastError: null,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    notification: {
      id: 101n,
      userId: 8n,
      groupId: 3n,
      type: NotificationType.RULE_CHANGED,
      refId: 42n,
      message: '생활 규칙이 변경되었습니다.',
      isRead: false,
      hiddenAt: null,
      createdAt: new Date('2026-07-18T09:00:00.000Z'),
    },
    subscription: {
      id: 11n,
      userId: 8n,
      endpoint: 'https://push.example.com/subscriptions/device-token',
      p256dhKey: 'p256dh-value',
      authKey: 'auth-value',
      userAgent: null,
      isActive: true,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findDeliveries.mockResolvedValue([delivery]);
    send.mockResolvedValue({ MessageId: 'message-1' });
    updateDeliveries.mockResolvedValue({ count: 1 });
  });

  it('publishes an active delivery without logging subscription credentials', async () => {
    await expect(publisher.publishPendingDeliveries()).resolves.toBe(1);

    const command = send.mock.calls[0]?.[0];
    const messageBody = command?.input.MessageBody;
    expect(messageBody).toBeDefined();
    expect(JSON.parse(messageBody as string)).toEqual({
      version: 1,
      deliveryId: '31',
      notification: {
        notificationId: '101',
        userId: '8',
        groupId: '3',
        type: NotificationType.RULE_CHANGED,
        refId: '42',
        message: '생활 규칙이 변경되었습니다.',
        createdAt: '2026-07-18T09:00:00.000Z',
      },
      subscription: {
        subscriptionId: '11',
        endpoint: delivery.subscription.endpoint,
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      },
    });
    expect(updateDeliveries).toHaveBeenCalledWith({
      where: { id: 31n, status: NotificationPushDeliveryStatus.PENDING },
      data: {
        status: NotificationPushDeliveryStatus.ENQUEUED,
        publishAttempts: { increment: 1 },
        enqueuedAt: updateDeliveries.mock.calls[0]?.[0].data.enqueuedAt,
        lastError: null,
      },
    });
    expect(updateDeliveries.mock.calls[0]?.[0].data.enqueuedAt).toBeInstanceOf(Date);
  });

  it('marks a delivery failed when its subscription was revoked before publication', async () => {
    findDeliveries.mockResolvedValue([
      { ...delivery, subscription: { ...delivery.subscription, isActive: false } },
    ]);

    await expect(publisher.publishPendingDeliveries()).resolves.toBe(0);

    expect(send).not.toHaveBeenCalled();
    expect(updateDeliveries).toHaveBeenCalledWith({
      where: { id: 31n, status: NotificationPushDeliveryStatus.PENDING },
      data: {
        status: NotificationPushDeliveryStatus.FAILED,
        failedAt: updateDeliveries.mock.calls[0]?.[0].data.failedAt,
        lastError: 'SUBSCRIPTION_INACTIVE',
      },
    });
    expect(updateDeliveries.mock.calls[0]?.[0].data.failedAt).toBeInstanceOf(Date);
  });

  it('keeps a failed SQS publication pending with exponential backoff', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('request failed'), { name: 'ServiceUnavailable' }),
    );

    await expect(publisher.publishPendingDeliveries()).resolves.toBe(0);

    expect(updateDeliveries).toHaveBeenCalledWith({
      where: { id: 31n, status: NotificationPushDeliveryStatus.PENDING },
      data: {
        publishAttempts: { increment: 1 },
        nextAttemptAt: updateDeliveries.mock.calls[0]?.[0].data.nextAttemptAt,
        lastError: 'ServiceUnavailable',
      },
    });
    expect(updateDeliveries.mock.calls[0]?.[0].data.nextAttemptAt).toBeInstanceOf(Date);
  });
});
