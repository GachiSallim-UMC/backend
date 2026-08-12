import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';

import { COGNITO_IDP_CLIENT } from './cognito.constants';

export function createCognitoClient(configService: ConfigService): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: configService.getOrThrow<string>('AWS_REGION'),
  });
}

export const COGNITO_IDP_CLIENT_PROVIDER: Provider = {
  provide: COGNITO_IDP_CLIENT,
  inject: [ConfigService],
  useFactory: createCognitoClient,
};
