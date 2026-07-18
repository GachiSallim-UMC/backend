import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { VapidPublicKeyResponseDto } from './dto/vapid-public-key-response.dto';

@Injectable()
export class VapidPublicKeyService {
  private readonly publicKey: string;

  constructor(private readonly config: ConfigService) {
    this.publicKey = this.config.getOrThrow<string>('NOTIFICATION_VAPID_PUBLIC_KEY');
  }

  getPublicKey(): VapidPublicKeyResponseDto {
    return { publicKey: this.publicKey };
  }
}
