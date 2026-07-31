import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RECEIPT_IMAGE_S3_CLIENT } from './receipt-image.constants';
import { ReceiptImageService } from './receipt-image.service';

import { AuthCommonModule } from '../auth/common/auth-common.module';

@Module({
  imports: [PrismaModule, AuthCommonModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    ReceiptImageService,
    {
      provide: RECEIPT_IMAGE_S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): S3Client =>
        new S3Client({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}