import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { createChatWebSocketDisconnectHandler } from './chat-websocket-disconnect';

describe('chat websocket $disconnect handler', () => {
  it('deletes the connection id and returns 200', async () => {
    const send = jest.fn<Promise<unknown>, [DeleteCommand]>().mockResolvedValue({});
    const client = { send } as unknown as DynamoDBDocumentClient;
    const handler = createChatWebSocketDisconnectHandler(client, 'chat-connections-table');

    const result = await handler({ requestContext: { connectionId: 'abc123' } });

    expect(result).toEqual({ statusCode: 200 });
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0][0];
    expect(command.input.TableName).toBe('chat-connections-table');
    expect(command.input.Key).toEqual({ connectionId: 'abc123' });
  });
});
