import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthCommonModule } from '../auth/common/auth-common.module';

@Module({
  imports: [PrismaModule, AuthCommonModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}