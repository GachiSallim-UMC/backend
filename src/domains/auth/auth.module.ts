import { Module } from '@nestjs/common';

import { AuthAccountModule } from './account/account.module';
import { AuthCommonModule } from './common/auth-common.module';
import { AuthPasswordModule } from './password/password.module';
import { AuthRegistrationModule } from './registration/registration.module';
import { AuthSessionModule } from './session/session.module';

@Module({
  imports: [
    AuthCommonModule,
    AuthRegistrationModule,
    AuthSessionModule,
    AuthAccountModule,
    AuthPasswordModule,
  ],
})
export class AuthModule {}
