import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService], // 다른 도메인(지출, 집안일 등)에서 주입받아 로그를 쌓기 위해 export
})
export class ActivitiesModule {}