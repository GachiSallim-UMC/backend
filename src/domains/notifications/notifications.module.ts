import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SQSClient } from '@aws-sdk/client-sqs';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { ChoreDueCommandConsumer } from './chore-due-command.consumer';
import {
  CHORE_DUE_SCHEDULER_CLIENT,
  CHORE_DUE_SQS_CLIENT,
} from './chore-due-scheduler.constants';
import { ChoreDueSchedulerService } from './chore-due-scheduler.service';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalNotificationsService } from './internal-notifications.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationOutboxPublisher } from './notification-outbox.publisher';
import { NotificationPushSubscriptionsController } from './notification-push-subscriptions.controller';
import { NotificationPushSubscriptionsService } from './notification-push-subscriptions.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationUsersService } from './notification-users.service';
import { NOTIFICATION_SQS_CLIENT } from './notification-sqs.constants';

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
    NotificationDeliveryService,
    NotificationOutboxPublisher,
    ChoreDueCommandConsumer,
    ChoreDueSchedulerService,
    {
      provide: NOTIFICATION_SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SQSClient =>
        new SQSClient({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
    {
      provide: CHORE_DUE_SQS_CLIENT,
      useExisting: NOTIFICATION_SQS_CLIENT,
    },
    {
      provide: CHORE_DUE_SCHEDULER_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SchedulerClient =>
        new SchedulerClient({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
  ],
  exports: [ChoreDueSchedulerService],
})
export class NotificationsModule {}
