import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { SuppliesController } from './supplies.controller';
import { SuppliesService } from './supplies.service';
import { SupplyUsersService } from './supply-users.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [SuppliesController],
  providers: [SuppliesService, SupplyUsersService],
})
export class SuppliesModule {}
