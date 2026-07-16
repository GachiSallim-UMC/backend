import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePushSubscriptionDto } from './create-push-subscription.dto';

describe('CreatePushSubscriptionDto', () => {
  it('accepts the standard browser PushSubscription shape', async () => {
    const dto = plainToInstance(CreatePushSubscriptionDto, {
      endpoint: 'https://push.example.com/subscriptions/device-token',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a non-HTTPS endpoint and empty nested keys', async () => {
    const dto = plainToInstance(CreatePushSubscriptionDto, {
      endpoint: 'http://push.example.com/device-token',
      keys: { p256dh: '', auth: '' },
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['endpoint', 'keys']),
    );
  });

  it('rejects a request that omits keys before the service reads nested values', async () => {
    const dto = plainToInstance(CreatePushSubscriptionDto, {
      endpoint: 'https://push.example.com/subscriptions/device-token',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('keys');
  });
});
