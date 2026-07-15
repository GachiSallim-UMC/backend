import { Module } from '@nestjs/common';

import { CognitoAccessTokenGuard } from './cognito-access-token.guard';
import { COGNITO_IDP_CLIENT_PROVIDER } from './cognito.provider';

@Module({
  providers: [COGNITO_IDP_CLIENT_PROVIDER, CognitoAccessTokenGuard],
  exports: [COGNITO_IDP_CLIENT_PROVIDER, CognitoAccessTokenGuard],
})
export class AuthCommonModule {}
