import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { ChoresAuthenticatedUserService } from './chores-authenticated-user.service';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [ChoresController],
  providers: [ChoresService, ChoresAuthenticatedUserService],
})
export class ChoresModule {}
