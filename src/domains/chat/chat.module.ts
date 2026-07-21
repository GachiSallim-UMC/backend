import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { ChatAuthenticatedUserService } from './chat-authenticated-user.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, ChatAuthenticatedUserService],
})
export class ChatModule {}
