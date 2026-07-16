import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../common/auth-common.module';
import { AuthAccountController } from './account.controller';
import { AuthAccountService } from './account.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AuthAccountController],
  providers: [AuthAccountService],
})
export class AuthAccountModule {}
