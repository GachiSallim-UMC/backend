import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../core/auth-core.module';
import { AuthAccountController } from './auth-account.controller';
import { AuthAccountService } from './auth-account.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthAccountController],
  providers: [AuthAccountService],
})
export class AuthAccountModule {}
