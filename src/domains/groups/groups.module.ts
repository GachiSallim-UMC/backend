import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { GroupsAuthenticatedUserService } from './groups-authenticated-user.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsAuthenticatedUserService],
})
export class GroupsModule {}
