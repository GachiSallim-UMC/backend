import { ConfigService } from '@nestjs/config';
import { NotificationPushDeliveryStatus, Prisma } from '@prisma/client';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPushResultConsumer } from './notification-push-result.consumer';

describe('NotificationPushResultConsumer', () => {
  const updateDeliveries = jest.fn<
    Promise<Prisma.BatchPayload>,
    [Prisma.NotificationPushDeliveryUpdateManyArgs]
  >();
  const updateSubscriptions = jest.fn<
    Promise<Prisma.BatchPayload>,
    [Prisma.NotificationPushSubscriptionUpdateManyArgs]
  >();
  const transaction = jest.fn(async (callback: (client: unknown) => Promise<void>) =>
    callback({
      notificationPushDelivery: { updateMany: updateDeliveries },
      notificationPushSubscription: { updateMany: updateSubscriptions },
    }),
  );
  const send = jest.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://sqs.example.com/push-result'),
    get: jest.fn((key: string, fallback?: unknown) => (key === 'NODE_ENV' ? 'test' : fallback)),
  } as unknown as ConfigService;
  const sqs = { send } as unknown as SQSClient;
  const consumer = new NotificationPushResultConsumer(prisma, config, sqs);

  beforeEach(() => {
    jest.clearAllMocks();
    updateDeliveries.mockResolvedValue({ count: 1 });
    updateSubscriptions.mockResolvedValue({ count: 1 });
    send.mockImplementation((command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        return Promise.resolve({
          Messages: [
            {
              Body: JSON.stringify({
                version: 1,
                deliveryId: '31',
                subscriptionId: '11',
                outcome: 'SENT',
              }),
              ReceiptHandle: 'receipt-1',
            },
          ],
        });
      }
      return Promise.resolve({});
    });
  });

  it('idempotently marks an enqueued delivery sent and updates last use', async () => {
    await expect(consumer.consumeResults()).resolves.toBe(1);

    const deliveryData = updateDeliveries.mock.calls[0]?.[0].data;
    const subscriptionData = updateSubscriptions.mock.calls[0]?.[0].data;
    expect(deliveryData.sentAt).toBeInstanceOf(Date);
    expect(subscriptionData.lastUsedAt).toBeInstanceOf(Date);
    expect(updateDeliveries).toHaveBeenCalledWith({
      where: {
        id: 31n,
        subscriptionId: 11n,
        status: NotificationPushDeliveryStatus.ENQUEUED,
      },
      data: {
        status: NotificationPushDeliveryStatus.SENT,
        sentAt: deliveryData.sentAt,
        lastError: null,
      },
    });
    expect(updateSubscriptions).toHaveBeenCalledWith({
      where: { id: 11n, isActive: true },
      data: { lastUsedAt: subscriptionData.lastUsedAt },
    });
    expect(send.mock.calls.some(([command]) => command instanceof DeleteMessageCommand)).toBe(true);
  });

  it('revokes a permanently expired subscription', async () => {
    send.mockImplementation((command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        return Promise.resolve({
          Messages: [
            {
              Body: JSON.stringify({
                version: 1,
                deliveryId: '31',
                subscriptionId: '11',
                outcome: 'EXPIRED',
                errorCode: 'PUSH_410',
              }),
              ReceiptHandle: 'receipt-1',
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    await expect(consumer.consumeResults()).resolves.toBe(1);

    const deliveryData = updateDeliveries.mock.calls[0]?.[0].data;
    const subscriptionData = updateSubscriptions.mock.calls[0]?.[0].data;
    expect(deliveryData).toMatchObject({
      status: NotificationPushDeliveryStatus.FAILED,
      lastError: 'PUSH_410',
    });
    expect(deliveryData.failedAt).toBeInstanceOf(Date);
    expect(subscriptionData.revokedAt).toBeInstanceOf(Date);
    expect(updateSubscriptions).toHaveBeenCalledWith({
      where: { id: 11n, isActive: true },
      data: { isActive: false, revokedAt: subscriptionData.revokedAt },
    });
  });

  it('does not repeat subscription changes for a duplicate result', async () => {
    updateDeliveries.mockResolvedValue({ count: 0 });

    await expect(consumer.consumeResults()).resolves.toBe(1);

    expect(updateSubscriptions).not.toHaveBeenCalled();
  });
});
