import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SQSClient } from '@aws-sdk/client-sqs';

import { CHORE_DUE_SCHEDULER_CLIENT, CHORE_DUE_SQS_CLIENT } from './chore-due-scheduler.constants';
import { ChoreDueSchedulerService } from './chore-due-scheduler.service';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';

@Module({
  controllers: [ChoresController],
  providers: [
    ChoresService,
    ChoreDueSchedulerService,
    {
      provide: CHORE_DUE_SCHEDULER_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SchedulerClient =>
        new SchedulerClient({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
    {
      provide: CHORE_DUE_SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SQSClient =>
        new SQSClient({
          region: config.getOrThrow<string>('AWS_REGION'),
          maxAttempts: 3,
        }),
    },
  ],
})
export class ChoresModule {}
