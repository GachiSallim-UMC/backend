import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RuleStatusService } from './rule-status.service';
import { RulesAuthenticatedUserService } from './rules-authenticated-user.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [AuthCommonModule, NotificationsModule],
  controllers: [RulesController],
  providers: [RulesService, RulesAuthenticatedUserService, RuleStatusService],
  exports: [RuleStatusService],
})
export class RulesModule {}
