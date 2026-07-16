import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationUsersService } from './notification-users.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationUsersService],
})
export class NotificationsModule {}
