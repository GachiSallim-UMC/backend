import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalNotificationsService } from './internal-notifications.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationOutboxPublisher } from './notification-outbox.publisher';
import { NotificationPushResultConsumer } from './notification-push-result.consumer';
import { NotificationPushSubscriptionsController } from './notification-push-subscriptions.controller';
import { NotificationPushSubscriptionsService } from './notification-push-subscriptions.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationUsersService } from './notification-users.service';
import { NOTIFICATION_SQS_CLIENT } from './notification-sqs.constants';
import { VapidPublicKeyService } from './vapid-public-key.service';

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
    NotificationPushResultConsumer,
    VapidPublicKeyService,
    {
      provide: NOTIFICATION_SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SQSClient =>
        new SQSClient({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
  ],
})
export class NotificationsModule {}
