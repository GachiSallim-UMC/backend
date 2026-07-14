import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../core/auth-core.module';
import { AuthPasswordController } from './auth-password.controller';
import { AuthPasswordService } from './auth-password.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthPasswordController],
  providers: [AuthPasswordService],
})
export class AuthPasswordModule {}
