import { ConfigService } from '@nestjs/config';

import { BusinessException } from '../../../common/exceptions/business.exception';
import { CognitoAuthGateway } from './cognito-auth.gateway';

describe('CognitoAuthGateway', () => {
  const config: Record<string, string> = {
    AWS_REGION: 'ap-northeast-2',
    COGNITO_USER_POOL_ID: 'ap-northeast-2_example',
    COGNITO_USER_POOL_CLIENT_ID: 'client-id',
  };
  const configService = {
    getOrThrow: jest.fn((key: string): string => config[key]),
  } as unknown as ConfigService;

  const createGateway = (send: jest.Mock): CognitoAuthGateway => {
    const gateway = new CognitoAuthGateway(configService);
    (gateway as unknown as { client: { send: jest.Mock } }).client = { send };
    return gateway;
  };

  it('treats an already signed-out access token as an idempotent success', async () => {
    const error = Object.assign(new Error('already signed out'), {
      name: 'NotAuthorizedException',
    });
    const gateway = createGateway(jest.fn().mockRejectedValue(error));

    await expect(gateway.globalSignOut('access-token')).resolves.toBeUndefined();
  });

  it('maps other global sign-out failures to the provider error contract', async () => {
    const gateway = createGateway(jest.fn().mockRejectedValue(new Error('provider unavailable')));

    await expect(gateway.globalSignOut('access-token')).rejects.toBeInstanceOf(BusinessException);
  });
});
