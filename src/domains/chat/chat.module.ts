import { Module } from '@nestjs/common';

import { AuthCommonModule } from '../auth/common/auth-common.module';
import { ChatAuthenticatedUserService } from './chat-authenticated-user.service';
import {
  CHAT_CONNECTIONS_DYNAMODB_CLIENT_PROVIDER,
  CHAT_WEBSOCKET_MANAGEMENT_CLIENT_PROVIDER,
} from './chat-broadcast.provider';
import { ChatBroadcastService } from './chat-broadcast.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatAuthenticatedUserService,
    ChatBroadcastService,
    CHAT_CONNECTIONS_DYNAMODB_CLIENT_PROVIDER,
    CHAT_WEBSOCKET_MANAGEMENT_CLIENT_PROVIDER,
  ],
})
export class ChatModule {}
