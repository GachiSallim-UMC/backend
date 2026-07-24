import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';

import { AuthCommonModule } from '../auth/common/auth-common.module';

@Module({
  imports: [PrismaModule, AuthCommonModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}