import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthCommonModule } from '../auth/common/auth-common.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
