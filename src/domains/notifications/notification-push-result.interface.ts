export type NotificationPushResultOutcome = 'SENT' | 'EXPIRED' | 'FAILED';

export interface NotificationPushResultV1 {
  version: 1;
  deliveryId: string;
  subscriptionId: string;
  outcome: NotificationPushResultOutcome;
  errorCode?: string;
}
