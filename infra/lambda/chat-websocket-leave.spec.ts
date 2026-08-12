import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { createChatWebSocketLeaveHandler } from './chat-websocket-leave';

describe('chat websocket room:leave handler', () => {
  const connectionId = 'conn-1';

  function buildEvent(body?: string) {
    return { requestContext: { connectionId }, body };
  }

  it('rejects and notifies the client when chatRoomId is missing', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>();
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const handler = createChatWebSocketLeaveHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
    );

    const result = await handler(buildEvent(JSON.stringify({})));

    expect(result).toEqual({ statusCode: 400 });
    expect(dynamoSend).not.toHaveBeenCalled();
    const command = managementSend.mock.calls[0][0];
    const payload = JSON.parse(Buffer.from(command.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
    };
    expect(payload.event).toBe('room:leave:error');
  });

  it('deletes the room subscription row and notifies the client', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const handler = createChatWebSocketLeaveHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
    );

    const result = await handler(buildEvent(JSON.stringify({ chatRoomId: '42' })));

    expect(result).toEqual({ statusCode: 200 });
    const deleteCommand = dynamoSend.mock.calls[0][0] as DeleteCommand;
    expect(deleteCommand.input.TableName).toBe('chat-connections-table');
    expect(deleteCommand.input.Key).toEqual({ connectionId, chatRoomId: '42' });

    const postCommand = managementSend.mock.calls[0][0];
    const payload = JSON.parse(Buffer.from(postCommand.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
      data: { chatRoomId: string };
    };
    expect(payload).toEqual({ event: 'room:left', data: { chatRoomId: '42' } });
  });

  it('succeeds even when the room was never joined (idempotent)', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const handler = createChatWebSocketLeaveHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
    );

    const result = await handler(buildEvent(JSON.stringify({ chatRoomId: '999' })));

    expect(result).toEqual({ statusCode: 200 });
  });
});
