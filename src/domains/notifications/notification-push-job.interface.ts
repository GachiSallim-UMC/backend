import { NotificationType } from '@prisma/client';

export interface NotificationPushJobV1 {
  version: 1;
  deliveryId: string;
  notification: {
    notificationId: string;
    userId: string;
    groupId: string | null;
    type: NotificationType;
    refId: string | null;
    message: string;
    createdAt: string;
  };
  subscription: {
    subscriptionId: string;
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}
