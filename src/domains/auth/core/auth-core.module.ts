import { Module } from '@nestjs/common';

import { AlbAuthGuard } from './alb-auth.guard';
import { CognitoAuthGateway } from './cognito-auth.gateway';

@Module({
  providers: [AlbAuthGuard, CognitoAuthGateway],
  exports: [AlbAuthGuard, CognitoAuthGateway],
})
export class AuthCoreModule {}
