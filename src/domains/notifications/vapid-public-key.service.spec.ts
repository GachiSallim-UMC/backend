import { ConfigService } from '@nestjs/config';

import { VapidPublicKeyService } from './vapid-public-key.service';

describe('VapidPublicKeyService', () => {
  const getOrThrow = jest.fn().mockReturnValue('public-key');
  const config = {
    getOrThrow,
  } as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('returns the configured public key without reading the VAPID secret', () => {
    const service = new VapidPublicKeyService(config);

    expect(service.getPublicKey()).toEqual({ publicKey: 'public-key' });
    expect(getOrThrow).toHaveBeenCalledWith('NOTIFICATION_VAPID_PUBLIC_KEY');
  });
});
