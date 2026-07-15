import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../common/auth-common.module';
import { AuthSessionController } from './session.controller';
import { AuthSessionService } from './session.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AuthSessionController],
  providers: [AuthSessionService],
})
export class AuthSessionModule {}
