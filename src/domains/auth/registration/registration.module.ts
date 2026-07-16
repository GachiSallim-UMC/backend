import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../common/auth-common.module';
import { AuthRegistrationController } from './registration.controller';
import { AuthRegistrationService } from './registration.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AuthRegistrationController],
  providers: [AuthRegistrationService],
})
export class AuthRegistrationModule {}
