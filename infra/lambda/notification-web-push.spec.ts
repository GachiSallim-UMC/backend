import type { SQSEvent, SQSRecord } from 'aws-lambda';

import type { NotificationPushResultV1 } from '../../src/domains/notifications/notification-push-result.interface';
import { createHandler } from './notification-web-push';

describe('notification web push Lambda', () => {
  const sendPush = jest.fn();
  const sendResult = jest.fn<Promise<void>, [NotificationPushResultV1]>();
  const getVapidSecret = jest.fn().mockResolvedValue({
    publicKey: 'public-key',
    privateKey: 'private-key',
    subject: 'mailto:admin@gachisallim.com',
  });
  const configureVapid = jest.fn();
  const handler = createHandler({ configureVapid, getVapidSecret, sendPush, sendResult });

  beforeEach(() => {
    jest.clearAllMocks();
    sendPush.mockResolvedValue({ statusCode: 201 });
    sendResult.mockResolvedValue();
  });

  it('sends a minimal payload and records success', async () => {
    await expect(handler(event())).resolves.toEqual({ batchItemFailures: [] });

    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.com/device' }),
      JSON.stringify({
        notificationId: '101',
        type: 'CHORE_DUE',
        message: '할 일 시간이 되었습니다.',
        url: '/notifications/101',
      }),
      expect.objectContaining({ TTL: 300, urgency: 'normal' }),
    );
    expect(sendResult).toHaveBeenCalledWith({
      version: 1,
      deliveryId: '31',
      subscriptionId: '11',
      outcome: 'SENT',
    });
  });

  it.each([404, 410])('expires a subscription for push status %i', async (statusCode) => {
    sendPush.mockRejectedValue(Object.assign(new Error('expired'), { statusCode }));

    await expect(handler(event())).resolves.toEqual({ batchItemFailures: [] });
    expect(sendResult).toHaveBeenCalledWith({
      version: 1,
      deliveryId: '31',
      subscriptionId: '11',
      outcome: 'EXPIRED',
      errorCode: `PUSH_${statusCode}`,
    });
  });

  it.each([429, 500, 503])('retries a transient push status %i', async (statusCode) => {
    sendPush.mockRejectedValue(Object.assign(new Error('temporary'), { statusCode }));

    await expect(handler(event())).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-1' }],
    });
    expect(sendResult).not.toHaveBeenCalled();
  });

  it('continues processing remaining subscriptions when one fails', async () => {
    sendPush.mockRejectedValueOnce(Object.assign(new Error('temporary'), { statusCode: 503 }));
    const second = record('message-2');

    await expect(handler({ Records: [record(), second] })).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-1' }],
    });
    expect(sendResult).toHaveBeenCalledTimes(1);
  });

  function event(): SQSEvent {
    return { Records: [record()] };
  }

  function record(messageId = 'message-1'): SQSRecord {
    return {
      messageId,
      receiptHandle: 'receipt',
      body: JSON.stringify({
        version: 1,
        deliveryId: '31',
        notification: {
          notificationId: '101',
          userId: '8',
          groupId: '3',
          type: 'CHORE_DUE',
          refId: '42',
          message: '할 일 시간이 되었습니다.',
          createdAt: '2026-07-18T09:00:00.000Z',
        },
        subscription: {
          subscriptionId: '11',
          endpoint: 'https://push.example.com/device',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        },
      }),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '0',
        SenderId: 'sender',
        ApproximateFirstReceiveTimestamp: '0',
      },
      messageAttributes: {},
      md5OfBody: 'md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:ap-northeast-2:123456789012:queue',
      awsRegion: 'ap-northeast-2',
    };
  }
});
