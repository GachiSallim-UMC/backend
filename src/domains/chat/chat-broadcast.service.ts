import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CHAT_CONNECTIONS_DYNAMODB_CLIENT,
  CHAT_WEBSOCKET_MANAGEMENT_CLIENT,
} from './chat-broadcast.constants';

const CHAT_ROOM_ID_INDEX = 'chatRoomId-index';

@Injectable()
export class ChatBroadcastService {
  constructor(
    @Inject(CHAT_CONNECTIONS_DYNAMODB_CLIENT) private readonly dynamoClient: DynamoDBDocumentClient,
    @Inject(CHAT_WEBSOCKET_MANAGEMENT_CLIENT)
    private readonly managementClient: ApiGatewayManagementApiClient,
    private readonly configService: ConfigService,
  ) {}

  async broadcastToRoom(
    chatRoomId: bigint,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const tableName = this.configService.getOrThrow<string>('CHAT_CONNECTIONS_TABLE_NAME');

    const result = await this.dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: CHAT_ROOM_ID_INDEX,
        KeyConditionExpression: 'chatRoomId = :chatRoomId',
        ExpressionAttributeValues: { ':chatRoomId': chatRoomId.toString() },
      }),
    );

    const connectionIds = (result.Items ?? [])
      .map((item) => item.connectionId as unknown)
      .filter((connectionId): connectionId is string => typeof connectionId === 'string');

    const data = Buffer.from(JSON.stringify({ event, data: payload }));

    await Promise.all(
      connectionIds.map((connectionId) =>
        this.sendToConnection(tableName, connectionId, chatRoomId.toString(), data),
      ),
    );
  }

  private async sendToConnection(
    tableName: string,
    connectionId: string,
    chatRoomId: string,
    data: Buffer,
  ): Promise<void> {
    try {
      await this.managementClient.send(
        new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }),
      );
    } catch (error) {
      if (error instanceof GoneException) {
        // Only this room's subscription row is cleaned up here; if the connection is
        // truly gone, its other room rows and "#CONNECTION#" metadata row will be
        // cleaned up the same way the next time each is broadcast to, or via TTL.
        await this.dynamoClient.send(
          new DeleteCommand({ TableName: tableName, Key: { connectionId, chatRoomId } }),
        );
        return;
      }

      throw error;
    }
  }
}
