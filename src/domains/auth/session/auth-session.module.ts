import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../core/auth-core.module';
import { AuthSessionController } from './auth-session.controller';

@Module({ imports: [AuthCoreModule], controllers: [AuthSessionController] })
export class AuthSessionModule {}
