import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import { createChatWebSocketJoinHandler } from './chat-websocket-join';

describe('chat websocket room:join handler', () => {
  const connectionId = 'conn-1';
  const apiBaseUrl = 'https://dev-api.gachisallim.com';

  function buildEvent(body?: string) {
    return {
      requestContext: { connectionId, authorizer: { accessToken: 'token-abc' } },
      body,
    };
  }

  it('rejects and notifies the client when chatRoomId is missing', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>();
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const fetchImpl = jest.fn<Promise<unknown>, [string, RequestInit]>();
    const handler = createChatWebSocketJoinHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
      apiBaseUrl,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await handler(buildEvent(JSON.stringify({})));

    expect(result).toEqual({ statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dynamoSend).not.toHaveBeenCalled();
    expect(managementSend).toHaveBeenCalledWith(expect.any(PostToConnectionCommand));
    const command = managementSend.mock.calls[0][0];
    expect(command.input.ConnectionId).toBe(connectionId);
    const payload = JSON.parse(Buffer.from(command.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
    };
    expect(payload.event).toBe('room:join:error');
  });

  it('denies and notifies the client when the membership check fails', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>();
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const fetchImpl = jest
      .fn<Promise<{ ok: boolean }>, [string, RequestInit]>()
      .mockResolvedValue({ ok: false });
    const handler = createChatWebSocketJoinHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
      apiBaseUrl,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await handler(buildEvent(JSON.stringify({ chatRoomId: '42' })));

    expect(result).toEqual({ statusCode: 403 });
    expect(fetchImpl).toHaveBeenCalledWith(`${apiBaseUrl}/api/v1/chat-rooms/42`, {
      headers: { Authorization: 'Bearer token-abc' },
    });
    expect(dynamoSend).not.toHaveBeenCalled();
    const command = managementSend.mock.calls[0][0];
    const payload = JSON.parse(Buffer.from(command.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
    };
    expect(payload.event).toBe('room:join:error');
  });

  it('records the room mapping and notifies the client when the membership check succeeds', async () => {
    const dynamoSend = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const managementSend = jest
      .fn<Promise<unknown>, [PostToConnectionCommand]>()
      .mockResolvedValue({});
    const fetchImpl = jest
      .fn<Promise<{ ok: boolean }>, [string, RequestInit]>()
      .mockResolvedValue({ ok: true });
    const handler = createChatWebSocketJoinHandler(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      'chat-connections-table',
      apiBaseUrl,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await handler(buildEvent(JSON.stringify({ chatRoomId: '42' })));

    expect(result).toEqual({ statusCode: 200 });
    const putCommand = dynamoSend.mock.calls[0][0] as PutCommand;
    expect(putCommand.input.TableName).toBe('chat-connections-table');
    expect(putCommand.input.Item).toEqual(
      expect.objectContaining({
        connectionId,
        chatRoomId: '42',
        joinedAt: expect.any(String) as string,
        expiresAt: expect.any(Number) as number,
      }),
    );

    const postCommand = managementSend.mock.calls[0][0];
    const payload = JSON.parse(Buffer.from(postCommand.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
      chatRoomId: string;
    };
    expect(payload).toEqual({ event: 'room:joined', chatRoomId: '42' });
  });
});
