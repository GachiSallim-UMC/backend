import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { RulesModule } from '../rules/rules.module';
import { GroupsAuthenticatedUserService } from './groups-authenticated-user.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthCommonModule, RulesModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsAuthenticatedUserService],
})
export class GroupsModule {}
