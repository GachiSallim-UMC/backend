import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { createChatWebSocketDisconnectHandler } from './chat-websocket-disconnect';

describe('chat websocket $disconnect handler', () => {
  it('deletes every row for the connection (metadata row plus joined rooms)', async () => {
    const send = jest.fn<Promise<unknown>, [unknown]>();
    send.mockResolvedValueOnce({
      Items: [
        { connectionId: 'abc123', chatRoomId: '#CONNECTION#' },
        { connectionId: 'abc123', chatRoomId: '42' },
        { connectionId: 'abc123', chatRoomId: '57' },
      ],
    });
    send.mockResolvedValue({});
    const client = { send } as unknown as DynamoDBDocumentClient;
    const handler = createChatWebSocketDisconnectHandler(client, 'chat-connections-table');

    const result = await handler({ requestContext: { connectionId: 'abc123' } });

    expect(result).toEqual({ statusCode: 200 });

    const queryCommand = send.mock.calls[0][0] as QueryCommand;
    expect(queryCommand.input.TableName).toBe('chat-connections-table');
    expect(queryCommand.input.ExpressionAttributeValues).toEqual({ ':connectionId': 'abc123' });

    expect(send).toHaveBeenCalledTimes(4);
    const deletedKeys = send.mock.calls
      .slice(1)
      .map((call) => (call[0] as DeleteCommand).input.Key);
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        { connectionId: 'abc123', chatRoomId: '#CONNECTION#' },
        { connectionId: 'abc123', chatRoomId: '42' },
        { connectionId: 'abc123', chatRoomId: '57' },
      ]),
    );
  });

  it('does nothing besides the query when no rows are found', async () => {
    const send = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ Items: [] });
    const client = { send } as unknown as DynamoDBDocumentClient;
    const handler = createChatWebSocketDisconnectHandler(client, 'chat-connections-table');

    const result = await handler({ requestContext: { connectionId: 'abc123' } });

    expect(result).toEqual({ statusCode: 200 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
