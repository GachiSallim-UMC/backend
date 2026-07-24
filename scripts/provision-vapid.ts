import {
  CreateSecretCommand,
  DescribeSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as webPush from 'web-push';

const DEFAULT_REGION = 'ap-northeast-2';
const PUBLIC_KEY_TAG = 'gachisallim:vapid-public-key';

type VapidEnvironment = 'develop' | 'main';

interface ProvisionOptions {
  environment: VapidEnvironment;
  profile?: string;
  region: string;
  subject: string;
}

interface SecretMetadata {
  publicKey?: string;
}

interface VapidKeys {
  privateKey: string;
  publicKey: string;
}

interface VapidStorage {
  createSecret(
    secretName: string,
    environment: VapidEnvironment,
    subject: string,
    keys: VapidKeys,
  ): Promise<void>;
  getPublicKeyParameter(parameterName: string): Promise<string | null>;
  getSecretMetadata(secretName: string): Promise<SecretMetadata | null>;
  putPublicKeyParameter(parameterName: string, publicKey: string): Promise<void>;
}

type ProvisionStatus = 'CREATED' | 'REPAIRED_PUBLIC_PARAMETER' | 'UNCHANGED';

interface ProvisionResult {
  parameterName: string;
  secretName: string;
  status: ProvisionStatus;
  verified: boolean;
}

class AwsVapidStorage implements VapidStorage {
  constructor(
    private readonly secretsManager: SecretsManagerClient,
    private readonly ssm: SSMClient,
  ) {}

  async getSecretMetadata(secretName: string): Promise<SecretMetadata | null> {
    try {
      const secret = await this.secretsManager.send(
        new DescribeSecretCommand({ SecretId: secretName }),
      );
      return {
        publicKey: secret.Tags?.find((tag) => tag.Key === PUBLIC_KEY_TAG)?.Value,
      };
    } catch (error) {
      if (isAwsNotFoundError(error, 'ResourceNotFoundException')) {
        return null;
      }
      throw error;
    }
  }

  async getPublicKeyParameter(parameterName: string): Promise<string | null> {
    try {
      const parameter = await this.ssm.send(
        new GetParameterCommand({ Name: parameterName, WithDecryption: false }),
      );
      return parameter.Parameter?.Value ?? null;
    } catch (error) {
      if (isAwsNotFoundError(error, 'ParameterNotFound')) {
        return null;
      }
      throw error;
    }
  }

  async createSecret(
    secretName: string,
    environment: VapidEnvironment,
    subject: string,
    keys: VapidKeys,
  ): Promise<void> {
    await this.secretsManager.send(
      new CreateSecretCommand({
        Description: `GachiSallim ${environment} Web Push VAPID signing key`,
        Name: secretName,
        SecretString: JSON.stringify({
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
          subject,
        }),
        Tags: [
          { Key: 'gachisallim:environment', Value: environment },
          { Key: 'gachisallim:managed-by', Value: 'vapid-provisioner' },
          { Key: PUBLIC_KEY_TAG, Value: keys.publicKey },
        ],
      }),
    );
  }

  async putPublicKeyParameter(parameterName: string, publicKey: string): Promise<void> {
    await this.ssm.send(
      new PutParameterCommand({
        DataType: 'text',
        Description: 'GachiSallim Web Push VAPID public key',
        Name: parameterName,
        Overwrite: false,
        Tier: 'Standard',
        Type: 'String',
        Value: publicKey,
      }),
    );
  }
}

export function parseProvisionOptions(args: string[]): ProvisionOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Expected a value after ${flag ?? 'argument'}.`);
    }
    values.set(flag, value);
  }

  const environment = values.get('--environment');
  if (environment !== 'develop' && environment !== 'main') {
    throw new Error('--environment must be either develop or main.');
  }

  const subject = values.get('--subject');
  if (!subject || !isValidSubject(subject)) {
    throw new Error('--subject must be a valid mailto: or HTTPS URI.');
  }

  const profile = values.get('--profile');
  const region = values.get('--region') ?? DEFAULT_REGION;
  const supportedFlags = new Set(['--environment', '--profile', '--region', '--subject']);
  const unsupportedFlag = [...values.keys()].find((flag) => !supportedFlags.has(flag));
  if (unsupportedFlag) {
    throw new Error(`Unsupported option: ${unsupportedFlag}`);
  }

  return {
    environment,
    ...(profile ? { profile } : {}),
    region,
    subject,
  };
}

export async function provisionVapid(
  options: ProvisionOptions,
  storage: VapidStorage,
  generateKeys: () => VapidKeys = webPush.generateVAPIDKeys,
): Promise<ProvisionResult> {
  const secretName = `gachisallim/${options.environment}/notification-vapid`;
  const parameterName = `/gachisallim/${options.environment}/notification-vapid-public-key`;
  const [secret, publicKeyParameter] = await Promise.all([
    storage.getSecretMetadata(secretName),
    storage.getPublicKeyParameter(parameterName),
  ]);

  if (secret && publicKeyParameter) {
    if (secret.publicKey && secret.publicKey !== publicKeyParameter) {
      throw new Error(
        `VAPID resources for ${options.environment} exist but their public keys do not match.`,
      );
    }
    return {
      parameterName,
      secretName,
      status: 'UNCHANGED',
      verified: Boolean(secret.publicKey),
    };
  }

  if (secret) {
    if (!secret.publicKey) {
      throw new Error(
        `Secret ${secretName} exists without provisioning metadata; refusing to guess its public key.`,
      );
    }
    await storage.putPublicKeyParameter(parameterName, secret.publicKey);
    return {
      parameterName,
      secretName,
      status: 'REPAIRED_PUBLIC_PARAMETER',
      verified: true,
    };
  }

  if (publicKeyParameter) {
    throw new Error(
      `Parameter ${parameterName} exists without ${secretName}; refusing to rotate an incomplete VAPID setup.`,
    );
  }

  const keys = generateKeys();
  await storage.createSecret(secretName, options.environment, options.subject, keys);
  await storage.putPublicKeyParameter(parameterName, keys.publicKey);

  return {
    parameterName,
    secretName,
    status: 'CREATED',
    verified: true,
  };
}

function isValidSubject(subject: string): boolean {
  try {
    const url = new URL(subject);
    return (
      (url.protocol === 'mailto:' && url.pathname.includes('@')) ||
      (url.protocol === 'https:' && Boolean(url.hostname))
    );
  } catch {
    return false;
  }
}

function isAwsNotFoundError(error: unknown, expectedName: string): boolean {
  return error instanceof Error && error.name === expectedName;
}

function usage(): string {
  return [
    'Usage:',
    '  npm run vapid:provision -- --environment <develop|main> --subject <mailto:|https: URI>',
    '    [--profile <aws-profile>] [--region <aws-region>]',
  ].join('\n');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }

  const options = parseProvisionOptions(process.argv.slice(2));
  const credentials = options.profile ? fromIni({ profile: options.profile }) : undefined;
  const storage = new AwsVapidStorage(
    new SecretsManagerClient({ credentials, region: options.region }),
    new SSMClient({ credentials, region: options.region }),
  );
  const result = await provisionVapid(options, storage);

  console.log(`VAPID provisioning status: ${result.status}`);
  console.log(`Secret: ${result.secretName}`);
  console.log(`Public parameter: ${result.parameterName}`);
  if (!result.verified) {
    console.log('Existing resources were not modified; their public-key match was not verifiable.');
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown provisioning error.';
    console.error(`VAPID provisioning failed: ${message}`);
    process.exitCode = 1;
  });
}
