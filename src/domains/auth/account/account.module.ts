import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthCommonModule } from '../common/auth-common.module';
import { AuthAccountController } from './account.controller';
import { AuthAccountService } from './account.service';
import { PROFILE_IMAGE_S3_CLIENT } from './profile-image.constants';
import { ProfileImageService } from './profile-image.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AuthAccountController],
  providers: [
    AuthAccountService,
    ProfileImageService,
    {
      provide: PROFILE_IMAGE_S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): S3Client =>
        new S3Client({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
  ],
})
export class AuthAccountModule {}
