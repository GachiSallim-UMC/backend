import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ENV_VALIDATION_SCHEMA } from './config/env.validation';
import { ActivitiesModule } from './domains/activities/activities.module';
import { AuthModule } from './domains/auth/auth.module';
import { ChatModule } from './domains/chat/chat.module';
import { ChoresModule } from './domains/chores/chores.module';
import { DashboardModule } from './domains/dashboard/dashboard.module';
import { ExpensesModule } from './domains/expenses/expenses.module';
import { GroupsModule } from './domains/groups/groups.module';
import { NotificationsModule } from './domains/notifications/notifications.module';
import { RulesModule } from './domains/rules/rules.module';
import { SuppliesModule } from './domains/supplies/supplies.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: ENV_VALIDATION_SCHEMA,
      validationOptions: {
        abortEarly: false,
      },
    }),
    TerminusModule,
    PrismaModule,
    AuthModule,
    GroupsModule,
    ChoresModule,
    ExpensesModule,
    SuppliesModule,
    RulesModule,
    DashboardModule,
    ChatModule,
    NotificationsModule,
    ActivitiesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
