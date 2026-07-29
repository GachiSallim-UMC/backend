import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    authorizer: {
      cognitoSub: string;
    };
  };
}

interface WebSocketLambdaResult {
  statusCode: number;
}

const CONNECTION_TTL_SECONDS = 2 * 60 * 60;

// Sentinel sort key for the row that tracks the connection itself, independent of any
// room it may join later. Room subscription rows use the real chatRoomId as sort key.
export const CONNECTION_METADATA_SORT_KEY = '#CONNECTION#';

export function createChatWebSocketConnectHandler(
  client: DynamoDBDocumentClient,
  tableName: string,
) {
  return async (event: WebSocketConnectEvent): Promise<WebSocketLambdaResult> => {
    const { connectionId, authorizer } = event.requestContext;

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          connectionId,
          chatRoomId: CONNECTION_METADATA_SORT_KEY,
          cognitoSub: authorizer.cognitoSub,
          connectedAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS,
        },
      }),
    );

    return { statusCode: 200 };
  };
}

const tableName = process.env.CHAT_CONNECTIONS_TABLE_NAME ?? '';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createChatWebSocketConnectHandler(client, tableName);
