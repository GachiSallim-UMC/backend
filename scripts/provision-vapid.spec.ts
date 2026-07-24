import { parseProvisionOptions, provisionVapid } from './provision-vapid';

interface SecretMetadata {
  publicKey?: string;
}

interface VapidKeys {
  privateKey: string;
  publicKey: string;
}

class MemoryVapidStorage {
  createdSecret:
    | {
        environment: 'develop' | 'main';
        keys: VapidKeys;
        secretName: string;
        subject: string;
      }
    | undefined;
  parameter: string | null = null;
  secret: SecretMetadata | null = null;

  async getSecretMetadata(): Promise<SecretMetadata | null> {
    return Promise.resolve(this.secret);
  }

  async getPublicKeyParameter(): Promise<string | null> {
    return Promise.resolve(this.parameter);
  }

  createSecret(
    secretName: string,
    environment: 'develop' | 'main',
    subject: string,
    keys: VapidKeys,
  ): Promise<void> {
    this.createdSecret = { environment, keys, secretName, subject };
    this.secret = { publicKey: keys.publicKey };
    return Promise.resolve();
  }

  putPublicKeyParameter(_parameterName: string, publicKey: string): Promise<void> {
    this.parameter = publicKey;
    return Promise.resolve();
  }
}

const OPTIONS = {
  environment: 'develop' as const,
  profile: 'gachisallim',
  region: 'ap-northeast-2',
  subject: 'mailto:ops@gachisallim.com',
};
const KEYS = { privateKey: 'private-test-key', publicKey: 'public-test-key' };

describe('VAPID provisioning', () => {
  it('parses an explicit environment, contact, profile, and region', () => {
    expect(
      parseProvisionOptions([
        '--environment',
        'develop',
        '--subject',
        'mailto:ops@gachisallim.com',
        '--profile',
        'gachisallim',
        '--region',
        'ap-northeast-2',
      ]),
    ).toEqual(OPTIONS);
  });

  it('rejects unsupported environments and invalid subjects', () => {
    expect(() =>
      parseProvisionOptions([
        '--environment',
        'staging',
        '--subject',
        'mailto:ops@gachisallim.com',
      ]),
    ).toThrow('--environment must be either develop or main.');
    expect(() =>
      parseProvisionOptions(['--environment', 'develop', '--subject', 'ops@gachisallim.com']),
    ).toThrow('--subject must be a valid mailto: or HTTPS URI.');
  });

  it('creates a matching secret and public parameter only when both are absent', async () => {
    const storage = new MemoryVapidStorage();

    const result = await provisionVapid(OPTIONS, storage, () => KEYS);

    expect(result).toEqual({
      parameterName: '/gachisallim/develop/notification-vapid-public-key',
      secretName: 'gachisallim/develop/notification-vapid',
      status: 'CREATED',
      verified: true,
    });
    expect(storage.createdSecret).toEqual({
      environment: 'develop',
      keys: KEYS,
      secretName: 'gachisallim/develop/notification-vapid',
      subject: 'mailto:ops@gachisallim.com',
    });
    expect(storage.parameter).toBe(KEYS.publicKey);
  });

  it('leaves an existing matching pair unchanged', async () => {
    const storage = new MemoryVapidStorage();
    storage.secret = { publicKey: KEYS.publicKey };
    storage.parameter = KEYS.publicKey;

    await expect(provisionVapid(OPTIONS, storage, () => KEYS)).resolves.toMatchObject({
      status: 'UNCHANGED',
      verified: true,
    });
    expect(storage.createdSecret).toBeUndefined();
  });

  it('repairs a missing public parameter from non-secret metadata', async () => {
    const storage = new MemoryVapidStorage();
    storage.secret = { publicKey: KEYS.publicKey };

    await expect(provisionVapid(OPTIONS, storage, () => KEYS)).resolves.toMatchObject({
      status: 'REPAIRED_PUBLIC_PARAMETER',
    });
    expect(storage.parameter).toBe(KEYS.publicKey);
  });

  it('refuses to overwrite inconsistent existing resources', async () => {
    const storage = new MemoryVapidStorage();
    storage.secret = { publicKey: 'different-public-key' };
    storage.parameter = KEYS.publicKey;

    await expect(provisionVapid(OPTIONS, storage, () => KEYS)).rejects.toThrow(
      'their public keys do not match',
    );
  });
});
