import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getMetadata(): { name: string; version: string } {
    return {
      name: this.configService.getOrThrow<string>('APP_NAME'),
      version: this.configService.getOrThrow<string>('APP_VERSION'),
    };
  }
}
