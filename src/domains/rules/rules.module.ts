import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { RulesAuthenticatedUserService } from './rules-authenticated-user.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [RulesController],
  providers: [RulesService, RulesAuthenticatedUserService],
})
export class RulesModule {}
