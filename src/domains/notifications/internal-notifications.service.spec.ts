import { GroupRole, NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { InternalNotificationsService } from './internal-notifications.service';
import { NotificationUsersService } from './notification-users.service';

describe('InternalNotificationsService', () => {
  const findGroup = jest.fn();
  const findMembership = jest.fn();
  const createNotification = jest.fn();
  const resolveActiveUserId = jest.fn();
  const prisma = {
    group: { findUnique: findGroup },
    groupMember: { findUnique: findMembership },
    notification: { create: createNotification },
  } as unknown as PrismaService;
  const notificationUsers = { resolveActiveUserId } as unknown as NotificationUsersService;
  const service = new InternalNotificationsService(prisma, notificationUsers);
  const dto = {
    userId: 8,
    groupId: 3,
    type: NotificationType.RULE_CHANGED,
    refId: 42,
    message: '생활 규칙이 변경되었습니다.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(7n);
    findGroup.mockResolvedValue({ isDeleted: false });
  });

  it('creates an alert when the actor is an active admin and the target is active', async () => {
    findMembership
      .mockResolvedValueOnce({ role: GroupRole.ADMIN, leftAt: null })
      .mockResolvedValueOnce({ leftAt: null, user: { isActive: true } });
    createNotification.mockResolvedValue({
      id: 101n,
      userId: 8n,
      groupId: 3n,
      type: NotificationType.RULE_CHANGED,
      refId: 42n,
      message: dto.message,
      isRead: false,
      createdAt: new Date('2026-07-16T09:00:00.000Z'),
    });

    await expect(service.createNotification('cognito-sub', dto)).resolves.toEqual({
      notificationId: 101,
      groupId: 3,
      type: NotificationType.RULE_CHANGED,
      refId: 42,
      message: dto.message,
      isRead: false,
      createdAt: '2026-07-16T09:00:00.000Z',
    });
    expect(findMembership).toHaveBeenNthCalledWith(1, {
      where: { userId_groupId: { userId: 7n, groupId: 3n } },
      select: { role: true, leftAt: true },
    });
    expect(findMembership).toHaveBeenNthCalledWith(2, {
      where: { userId_groupId: { userId: 8n, groupId: 3n } },
      select: { leftAt: true, user: { select: { isActive: true } } },
    });
    expect(createNotification).toHaveBeenCalledWith({
      data: {
        userId: 8n,
        groupId: 3n,
        type: NotificationType.RULE_CHANGED,
        refId: 42n,
        message: dto.message,
      },
    });
  });

  it('rejects a missing or deleted group before checking memberships', async () => {
    findGroup.mockResolvedValue(null);

    await expect(service.createNotification('cognito-sub', dto)).rejects.toMatchObject({
      code: 'GROUP_NOT_FOUND',
    });
    expect(findMembership).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not an active group admin', async () => {
    findMembership.mockResolvedValueOnce({ role: GroupRole.MEMBER, leftAt: null });

    await expect(service.createNotification('cognito-sub', dto)).rejects.toMatchObject({
      code: 'NOTIFICATION_FORBIDDEN',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('rejects a missing, departed, or inactive target member', async () => {
    findMembership
      .mockResolvedValueOnce({ role: GroupRole.ADMIN, leftAt: null })
      .mockResolvedValueOnce({ leftAt: null, user: { isActive: false } });

    await expect(service.createNotification('cognito-sub', dto)).rejects.toMatchObject({
      code: 'NOTIFICATION_TARGET_NOT_FOUND',
    });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
