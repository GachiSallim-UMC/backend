import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: 'ws',
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    client.emit('connected', { clientId: client.id });
  }

  handleDisconnect(): void {
    return undefined;
  }

  @SubscribeMessage('ping')
  handlePing(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket,
  ): { event: string; data: unknown } {
    return {
      event: 'pong',
      data: {
        clientId: client.id,
        payload,
      },
    };
  }
}
