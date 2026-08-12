import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RECEIPT_IMAGE_S3_CLIENT } from './receipt-image.constants';
import { ReceiptImageService } from './receipt-image.service';
import { BankAccountService } from './bank-account.service';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthCommonModule, NotificationsModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    ReceiptImageService,
    BankAccountService,
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