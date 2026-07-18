import { ConfigService } from '@nestjs/config';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { VapidPublicKeyService } from './vapid-public-key.service';

describe('VapidPublicKeyService', () => {
  const send = jest.fn();
  const config = {
    getOrThrow: jest.fn().mockReturnValue('gachisallim/develop/notification-vapid'),
  } as unknown as ConfigService;
  const secrets = { send } as unknown as SecretsManagerClient;

  beforeEach(() => jest.clearAllMocks());

  it('returns and caches only the public key from the VAPID secret', async () => {
    send.mockResolvedValue({
      SecretString: JSON.stringify({
        publicKey: 'public-key',
        privateKey: 'private-key',
        subject: 'mailto:admin@gachisallim.com',
      }),
    });
    const service = new VapidPublicKeyService(config, secrets);

    await expect(service.getPublicKey()).resolves.toEqual({ publicKey: 'public-key' });
    await expect(service.getPublicKey()).resolves.toEqual({ publicKey: 'public-key' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a secret without a public key', async () => {
    send.mockResolvedValue({ SecretString: JSON.stringify({ privateKey: 'private-key' }) });
    const service = new VapidPublicKeyService(config, secrets);

    await expect(service.getPublicKey()).rejects.toThrow('VAPID_PUBLIC_KEY_REQUIRED');
  });
});
