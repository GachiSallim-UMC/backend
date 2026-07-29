import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { createChatWebSocketConnectHandler } from './chat-websocket-connect';

describe('chat websocket $connect handler', () => {
  it('stores the connection id with a TTL and returns 200', async () => {
    const send = jest.fn<Promise<unknown>, [PutCommand]>().mockResolvedValue({});
    const client = { send } as unknown as DynamoDBDocumentClient;
    const handler = createChatWebSocketConnectHandler(client, 'chat-connections-table');

    const result = await handler({
      requestContext: { connectionId: 'abc123', authorizer: { cognitoSub: 'user-sub' } },
    });

    expect(result).toEqual({ statusCode: 200 });
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0][0];
    expect(command.input.TableName).toBe('chat-connections-table');
    expect(command.input.Item).toEqual(
      expect.objectContaining({
        connectionId: 'abc123',
        chatRoomId: '#CONNECTION#',
        cognitoSub: 'user-sub',
        connectedAt: expect.any(String) as string,
        expiresAt: expect.any(Number) as number,
      }),
    );
  });
});
