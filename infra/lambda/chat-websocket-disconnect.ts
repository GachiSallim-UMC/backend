import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

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

    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { connectionId },
      }),
    );

    return { statusCode: 200 };
  };
}

const tableName = process.env.CHAT_CONNECTIONS_TABLE_NAME ?? '';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createChatWebSocketDisconnectHandler(client, tableName);
