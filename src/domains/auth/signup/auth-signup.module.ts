import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../core/auth-core.module';
import { AuthSignupController } from './auth-signup.controller';
import { AuthSignupService } from './auth-signup.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthSignupController],
  providers: [AuthSignupService],
})
export class AuthSignupModule {}
