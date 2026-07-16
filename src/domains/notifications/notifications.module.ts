import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalNotificationsService } from './internal-notifications.service';
import { NotificationPushSubscriptionsController } from './notification-push-subscriptions.controller';
import { NotificationPushSubscriptionsService } from './notification-push-subscriptions.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationUsersService } from './notification-users.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [
    NotificationsController,
    NotificationPushSubscriptionsController,
    InternalNotificationsController,
  ],
  providers: [
    NotificationsService,
    NotificationUsersService,
    NotificationPushSubscriptionsService,
    InternalNotificationsService,
  ],
})
export class NotificationsModule {}
