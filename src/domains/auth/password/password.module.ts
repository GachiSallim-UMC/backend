import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../common/auth-common.module';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [PasswordController],
  providers: [PasswordService],
})
export class AuthPasswordModule {}
