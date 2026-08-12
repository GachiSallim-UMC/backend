import { NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationUsersService } from './notification-users.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const updateMany = jest.fn();
  const resolveActiveUserId = jest.fn();
  const prisma = {
    notification: { findMany, count, updateMany },
  } as unknown as PrismaService;
  const notificationUsers = {
    resolveActiveUserId,
  } as unknown as NotificationUsersService;
  const service = new NotificationsService(prisma, notificationUsers);

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(7n);
  });

  it('lists only notifications selected for the authenticated user and group in newest-first order', async () => {
    findMany.mockResolvedValue([
      {
        id: 11n,
        userId: 7n,
        groupId: 3n,
        type: NotificationType.CHORE_DUE,
        refId: 42n,
        message: '오늘까지 완료할 집안일이 있습니다.',
        isRead: false,
        createdAt: new Date('2026-07-16T09:00:00.000Z'),
      },
    ]);

    await expect(service.listNotifications('cognito-sub', 3)).resolves.toEqual({
      notifications: [
        {
          notificationId: 11,
          groupId: 3,
          type: NotificationType.CHORE_DUE,
          refId: 42,
          message: '오늘까지 완료할 집안일이 있습니다.',
          isRead: false,
          createdAt: '2026-07-16T09:00:00.000Z',
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 7n, groupId: 3n, hiddenAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('counts unread notifications for the authenticated user and group', async () => {
    count.mockResolvedValue(4);

    await expect(service.getUnreadCount('cognito-sub', 3)).resolves.toEqual({ unreadCount: 4 });
    expect(count).toHaveBeenCalledWith({
      where: { userId: 7n, groupId: 3n, isRead: false, hiddenAt: null },
    });
  });

  it('marks one visible owned notification as read', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(service.readNotification('cognito-sub', 11n)).resolves.toEqual({
      notificationId: 11,
      isRead: true,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 11n, userId: 7n, hiddenAt: null },
      data: { isRead: true },
    });
  });

  it('does not reveal a missing, hidden, or other-user notification', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.readNotification('cognito-sub', 99n)).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
    });
  });

  it('marks all visible unread notifications for the authenticated user and group as read', async () => {
    updateMany.mockResolvedValue({ count: 3 });

    await expect(service.readAllNotifications('cognito-sub', 3)).resolves.toEqual({
      updatedCount: 3,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 7n, groupId: 3n, isRead: false, hiddenAt: null },
      data: { isRead: true },
    });
  });

  it('soft hides one visible owned notification', async () => {
    const hiddenAt = new Date('2026-07-16T12:00:00.000Z');
    jest.useFakeTimers({ now: hiddenAt });
    updateMany.mockResolvedValue({ count: 1 });

    try {
      await expect(service.hideNotification('cognito-sub', 11n)).resolves.toBeUndefined();
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 11n, userId: 7n, hiddenAt: null },
        data: { hiddenAt },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
