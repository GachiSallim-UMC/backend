import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../core/auth-core.module';

@Module({ imports: [AuthCoreModule] })
export class AuthSessionModule {}
