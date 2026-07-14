import { Module } from '@nestjs/common';

import { AuthAccountModule } from './account/auth-account.module';
import { AuthPasswordModule } from './password/auth-password.module';
import { AuthSessionModule } from './session/auth-session.module';
import { AuthSignupModule } from './signup/auth-signup.module';

@Module({
  imports: [AuthSignupModule, AuthSessionModule, AuthAccountModule, AuthPasswordModule],
})
export class AuthModule {}
