import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

interface WebSocketLeaveEvent {
  requestContext: {
    connectionId: string;
  };
  body?: string;
}

interface WebSocketLambdaResult {
  statusCode: number;
}

interface LeaveRequestBody {
  chatRoomId?: string;
}

const LEAVE_ERROR_EVENT = 'room:leave:error';
const LEAVE_SUCCESS_EVENT = 'room:left';

export function createChatWebSocketLeaveHandler(
  dynamoClient: DynamoDBDocumentClient,
  managementClient: ApiGatewayManagementApiClient,
  tableName: string,
) {
  return async (event: WebSocketLeaveEvent): Promise<WebSocketLambdaResult> => {
    const { connectionId } = event.requestContext;
    const chatRoomId = parseChatRoomId(event.body);

    if (!chatRoomId) {
      await sendEvent(managementClient, connectionId, LEAVE_ERROR_EVENT, {
        message: 'chatRoomId가 필요합니다.',
      });
      return { statusCode: 400 };
    }

    // Deleting a row that was never joined (or already left) succeeds silently, so this
    // is idempotent by construction.
    await dynamoClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { connectionId, chatRoomId },
      }),
    );

    await sendEvent(managementClient, connectionId, LEAVE_SUCCESS_EVENT, { chatRoomId });

    return { statusCode: 200 };
  };
}

function parseChatRoomId(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const payload = JSON.parse(body) as LeaveRequestBody;
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
      Data: Buffer.from(JSON.stringify({ event, ...data })),
    }),
  );
}

const tableName = process.env.CHAT_CONNECTIONS_TABLE_NAME ?? '';
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const managementClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.CHAT_WEBSOCKET_CALLBACK_URL,
});

export const handler = createChatWebSocketLeaveHandler(dynamoClient, managementClient, tableName);
