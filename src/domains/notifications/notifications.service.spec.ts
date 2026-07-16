import { NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationUsersService } from './notification-users.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const resolveActiveUserId = jest.fn();
  const prisma = { notification: { findMany, count } } as unknown as PrismaService;
  const notificationUsers = {
    resolveActiveUserId,
  } as unknown as NotificationUsersService;
  const service = new NotificationsService(prisma, notificationUsers);

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(7n);
  });

  it('lists only notifications selected for the authenticated user in newest-first order', async () => {
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

    await expect(service.listNotifications('cognito-sub')).resolves.toEqual({
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
      where: { userId: 7n },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('counts unread notifications for the authenticated user', async () => {
    count.mockResolvedValue(4);

    await expect(service.getUnreadCount('cognito-sub')).resolves.toEqual({ unreadCount: 4 });
    expect(count).toHaveBeenCalledWith({ where: { userId: 7n, isRead: false } });
  });
});
