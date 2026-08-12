import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { ConfigService } from '@nestjs/config';

import { createCognitoClient } from './cognito.provider';

describe('createCognitoClient', () => {
  it('creates a Cognito client with the configured AWS region', () => {
    const getOrThrow = jest.fn().mockReturnValue('ap-northeast-2');
    const configService = {
      getOrThrow,
    } as unknown as ConfigService;

    const client = createCognitoClient(configService);

    expect(client).toBeInstanceOf(CognitoIdentityProviderClient);
    expect(getOrThrow).toHaveBeenCalledWith('AWS_REGION');
    client.destroy();
  });
});
