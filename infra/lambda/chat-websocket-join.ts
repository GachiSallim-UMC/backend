import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface WebSocketJoinEvent {
  requestContext: {
    connectionId: string;
    authorizer: {
      accessToken: string;
    };
  };
  body?: string;
}

interface WebSocketLambdaResult {
  statusCode: number;
}

interface JoinRequestBody {
  chatRoomId?: string;
}

const JOIN_ERROR_EVENT = 'room:join:error';
const JOIN_SUCCESS_EVENT = 'room:joined';
const ROOM_SUBSCRIPTION_TTL_SECONDS = 2 * 60 * 60;

export function createChatWebSocketJoinHandler(
  dynamoClient: DynamoDBDocumentClient,
  managementClient: ApiGatewayManagementApiClient,
  tableName: string,
  apiBaseUrl: string,
  fetchImpl: typeof fetch,
) {
  return async (event: WebSocketJoinEvent): Promise<WebSocketLambdaResult> => {
    const { connectionId, authorizer } = event.requestContext;
    const chatRoomId = parseChatRoomId(event.body);

    if (!chatRoomId) {
      await sendEvent(managementClient, connectionId, JOIN_ERROR_EVENT, {
        message: 'chatRoomId가 필요합니다.',
      });
      return { statusCode: 400 };
    }

    const membershipResponse = await fetchImpl(`${apiBaseUrl}/api/v1/chat-rooms/${chatRoomId}`, {
      headers: { Authorization: `Bearer ${authorizer.accessToken}` },
    });

    if (!membershipResponse.ok) {
      await sendEvent(managementClient, connectionId, JOIN_ERROR_EVENT, {
        message: '채팅방 멤버가 아닙니다.',
      });
      return { statusCode: 403 };
    }

    // A separate item per (connectionId, chatRoomId) pair, so joining a new room never
    // overwrites a connection's other room subscriptions.
    await dynamoClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          connectionId,
          chatRoomId,
          joinedAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + ROOM_SUBSCRIPTION_TTL_SECONDS,
        },
      }),
    );

    await sendEvent(managementClient, connectionId, JOIN_SUCCESS_EVENT, { chatRoomId });

    return { statusCode: 200 };
  };
}

function parseChatRoomId(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const payload = JSON.parse(body) as JoinRequestBody;
    return typeof payload.chatRoomId === 'string' && payload.chatRoomId.length > 0
      ? payload.chatRoomId
      : undefined;
  } catch {
    return undefined;
  }
}

async function sendEvent(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify({ event, data })),
    }),
  );
}

const tableName = process.env.CHAT_CONNECTIONS_TABLE_NAME ?? '';
const apiBaseUrl = process.env.CHAT_API_BASE_URL ?? '';
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const managementClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.CHAT_WEBSOCKET_CALLBACK_URL,
});

export const handler = createChatWebSocketJoinHandler(
  dynamoClient,
  managementClient,
  tableName,
  apiBaseUrl,
  fetch,
);
