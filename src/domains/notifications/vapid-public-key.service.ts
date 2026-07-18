import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { VapidPublicKeyResponseDto } from './dto/vapid-public-key-response.dto';
import { NOTIFICATION_SECRETS_CLIENT } from './notification-sqs.constants';

interface VapidSecret {
  publicKey: string;
}

@Injectable()
export class VapidPublicKeyService {
  private readonly secretId: string;
  private cachedPublicKey?: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_SECRETS_CLIENT) private readonly secrets: SecretsManagerClient,
  ) {
    this.secretId = this.config.getOrThrow<string>('NOTIFICATION_VAPID_SECRET_ID');
  }

  async getPublicKey(): Promise<VapidPublicKeyResponseDto> {
    if (!this.cachedPublicKey) {
      const response = await this.secrets.send(
        new GetSecretValueCommand({ SecretId: this.secretId }),
      );
      this.cachedPublicKey = this.parseSecret(response.SecretString).publicKey;
    }

    return { publicKey: this.cachedPublicKey };
  }

  private parseSecret(secretString: string | undefined): VapidSecret {
    if (!secretString) {
      throw new Error('VAPID_SECRET_STRING_REQUIRED');
    }

    const secret = JSON.parse(secretString) as Partial<VapidSecret>;
    if (typeof secret.publicKey !== 'string' || secret.publicKey.length === 0) {
      throw new Error('VAPID_PUBLIC_KEY_REQUIRED');
    }

    return { publicKey: secret.publicKey };
  }
}
