import { NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService', () => {
  const findSubscriptions = jest.fn();
  const findPreference = jest.fn();
  const createNotification = jest.fn();
  const findNotification = jest.fn();
  const transaction = {
    notificationPushSubscription: { findMany: findSubscriptions },
    userNotificationPreference: { findUnique: findPreference },
    notification: { create: createNotification, findUnique: findNotification },
  };
  const runTransaction = jest.fn((callback: (client: typeof transaction) => unknown) =>
    callback(transaction),
  );
  const prisma = {
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const service = new NotificationDeliveryService(prisma);
  const input = {
    userId: 8n,
    groupId: 3n,
    type: NotificationType.RULE_CHANGED,
    refId: 42n,
    message: '생활 규칙이 변경되었습니다.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createNotification.mockResolvedValue({ id: 101n });
    findNotification.mockResolvedValue(null);
    findPreference.mockResolvedValue(null);
  });

  it('returns an existing notification for a duplicate dedupe key', async () => {
    const existing = { id: 101n };
    findNotification.mockResolvedValue(existing);

    await expect(
      service.createNotification({ ...input, dedupeKey: 'CHORE_DUE:11:2026-07-20' }),
    ).resolves.toBe(existing);

    expect(findSubscriptions).not.toHaveBeenCalled();
    expect(findPreference).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('creates the notification and one delivery per active subscription atomically', async () => {
    findSubscriptions.mockResolvedValue([{ id: 11n }, { id: 12n }]);

    await service.createNotification(input);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(findSubscriptions).toHaveBeenCalledWith({
      where: { userId: 8n, isActive: true },
      select: { id: true },
    });
    expect(findPreference).toHaveBeenCalledWith({
      where: { userId: 8n },
      select: {
        choreDueEnabled: true,
        supplyStatusChangedEnabled: true,
        newMessageEnabled: true,
        expenseRequestEnabled: true,
        ruleAgreementRequestEnabled: true,
        groupActivityEnabled: true,
      },
    });
    expect(createNotification).toHaveBeenCalledWith({
      data: {
        ...input,
        pushDeliveries: {
          create: [{ subscriptionId: 11n }, { subscriptionId: 12n }],
        },
      },
    });
  });

  it('still creates an inbox notification when the user has no active subscription', async () => {
    findSubscriptions.mockResolvedValue([]);

    await service.createNotification(input);

    expect(createNotification).toHaveBeenCalledWith({
      data: {
        ...input,
        pushDeliveries: { create: [] },
      },
    });
  });

  it('keeps the inbox notification but skips push when the type is disabled', async () => {
    findPreference.mockResolvedValue({
      choreDueEnabled: true,
      supplyStatusChangedEnabled: true,
      newMessageEnabled: true,
      expenseRequestEnabled: true,
      ruleAgreementRequestEnabled: false,
      groupActivityEnabled: true,
    });

    await service.createNotification(input);

    expect(findSubscriptions).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith({
      data: {
        ...input,
        pushDeliveries: { create: [] },
      },
    });
  });

  it('uses the group activity setting as a group notification master switch', async () => {
    findPreference.mockResolvedValue({
      choreDueEnabled: true,
      supplyStatusChangedEnabled: true,
      newMessageEnabled: true,
      expenseRequestEnabled: true,
      ruleAgreementRequestEnabled: true,
      groupActivityEnabled: false,
    });

    await service.createNotification(input);

    expect(findSubscriptions).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith({
      data: {
        ...input,
        pushDeliveries: { create: [] },
      },
    });
  });
});
