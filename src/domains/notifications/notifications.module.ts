import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalNotificationsService } from './internal-notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationUsersService } from './notification-users.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [NotificationsController, InternalNotificationsController],
  providers: [NotificationsService, NotificationUsersService, InternalNotificationsService],
})
export class NotificationsModule {}
