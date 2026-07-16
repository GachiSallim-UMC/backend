import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPushSubscriptionsService } from './notification-push-subscriptions.service';
import { NotificationUsersService } from './notification-users.service';

describe('NotificationPushSubscriptionsService', () => {
  const findMany = jest.fn();
  const upsert = jest.fn();
  const updateMany = jest.fn();
  const resolveActiveUserId = jest.fn();
  const prisma = {
    notificationPushSubscription: { findMany, upsert, updateMany },
  } as unknown as PrismaService;
  const notificationUsers = { resolveActiveUserId } as unknown as NotificationUsersService;
  const service = new NotificationPushSubscriptionsService(prisma, notificationUsers);
  const record = {
    id: 15n,
    endpoint: 'https://push.example.com/subscriptions/device-token',
    userAgent: 'Mozilla/5.0',
    isActive: true,
    lastUsedAt: null,
    createdAt: new Date('2026-07-16T09:00:00.000Z'),
    updatedAt: new Date('2026-07-16T10:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(7n);
  });

  it('lists only active subscriptions without authentication keys', async () => {
    findMany.mockResolvedValue([record]);

    await expect(service.listSubscriptions('cognito-sub')).resolves.toEqual({
      subscriptions: [
        {
          subscriptionId: 15,
          endpoint: record.endpoint,
          userAgent: 'Mozilla/5.0',
          isActive: true,
          lastUsedAt: null,
          createdAt: '2026-07-16T09:00:00.000Z',
          updatedAt: '2026-07-16T10:00:00.000Z',
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 7n, isActive: true },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('atomically creates or reassigns and reactivates an endpoint', async () => {
    upsert.mockResolvedValue(record);
    const dto = {
      endpoint: record.endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    await expect(
      service.registerSubscription('cognito-sub', dto, 'Mozilla/5.0'),
    ).resolves.toMatchObject({ subscriptionId: 15, endpoint: record.endpoint, isActive: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: record.endpoint },
        create: {
          userId: 7n,
          endpoint: record.endpoint,
          p256dhKey: 'p256dh-key',
          authKey: 'auth-key',
          userAgent: 'Mozilla/5.0',
        },
        update: {
          userId: 7n,
          p256dhKey: 'p256dh-key',
          authKey: 'auth-key',
          userAgent: 'Mozilla/5.0',
          isActive: true,
          revokedAt: null,
        },
      }),
    );
  });

  it('soft revokes an active owned subscription', async () => {
    const revokedAt = new Date('2026-07-16T12:00:00.000Z');
    jest.useFakeTimers({ now: revokedAt });
    updateMany.mockResolvedValue({ count: 1 });

    try {
      await expect(service.revokeSubscription('cognito-sub', 15n)).resolves.toBeUndefined();
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 15n, userId: 7n, isActive: true },
        data: { isActive: false, revokedAt },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not reveal a missing or other-user subscription', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeSubscription('cognito-sub', 99n)).rejects.toMatchObject({
      code: 'NOTIFICATION_SUBSCRIPTION_NOT_FOUND',
    });
  });
});
