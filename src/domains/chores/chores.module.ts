import { Module } from '@nestjs/common';

import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';

@Module({
  controllers: [ChoresController],
  providers: [ChoresService],
})
export class ChoresModule {}
