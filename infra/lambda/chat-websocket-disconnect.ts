import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
  };
}

interface WebSocketLambdaResult {
  statusCode: number;
}

export function createChatWebSocketDisconnectHandler(
  client: DynamoDBDocumentClient,
  tableName: string,
) {
  return async (event: WebSocketDisconnectEvent): Promise<WebSocketLambdaResult> => {
    const { connectionId } = event.requestContext;

    // A connection may have joined several rooms (one row per chatRoomId) plus the
    // "#CONNECTION#" metadata row written at $connect; all of them share the same
    // connectionId partition key and must be cleaned up together.
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: { ':connectionId': connectionId },
      }),
    );

    const chatRoomIds = (result.Items ?? [])
      .map((item) => item.chatRoomId as unknown)
      .filter((chatRoomId): chatRoomId is string => typeof chatRoomId === 'string');

    await Promise.all(
      chatRoomIds.map((chatRoomId) =>
        client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { connectionId, chatRoomId },
          }),
        ),
      ),
    );

    return { statusCode: 200 };
  };
}

const tableName = process.env.CHAT_CONNECTIONS_TABLE_NAME ?? '';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createChatWebSocketDisconnectHandler(client, tableName);
