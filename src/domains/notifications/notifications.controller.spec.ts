import { jest } from '@jest/globals';

import { AuthContext } from '../auth/common/auth-context.interface';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  const auth: AuthContext = {
    cognitoSub: 'cognito-sub',
    accessToken: 'access-token',
  };
  const query = { groupId: 3 };
  const listNotifications = jest.fn<NotificationsService['listNotifications']>();
  const getUnreadCount = jest.fn<NotificationsService['getUnreadCount']>();
  const readAllNotifications = jest.fn<NotificationsService['readAllNotifications']>();
  const notificationsService = {
    listNotifications,
    getUnreadCount,
    readAllNotifications,
  } as unknown as NotificationsService;
  const notificationPreferences = {} as NotificationPreferencesService;
  const controller = new NotificationsController(notificationsService, notificationPreferences);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards groupId when listing notifications', async () => {
    listNotifications.mockResolvedValue({ notifications: [] });

    await controller.listNotifications(auth, query);

    expect(listNotifications).toHaveBeenCalledWith('cognito-sub', 3);
  });

  it('forwards groupId when counting unread notifications', async () => {
    getUnreadCount.mockResolvedValue({ unreadCount: 0 });

    await controller.getUnreadCount(auth, query);

    expect(getUnreadCount).toHaveBeenCalledWith('cognito-sub', 3);
  });

  it('forwards groupId when marking all notifications as read', async () => {
    readAllNotifications.mockResolvedValue({ updatedCount: 0 });

    await controller.readAllNotifications(auth, query);

    expect(readAllNotifications).toHaveBeenCalledWith('cognito-sub', 3);
  });
});
