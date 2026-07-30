/// <reference types="jest" />
import { jest } from '@jest/globals';
import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { ChatBroadcastService } from './chat-broadcast.service';

describe('ChatBroadcastService', () => {
  const tableName = 'gachisallim-develop-chat-connections';

  function createService(
    dynamoSend: jest.MockedFunction<(command: unknown) => Promise<unknown>>,
    managementSend: jest.MockedFunction<(command: unknown) => Promise<unknown>>,
  ) {
    const configService = { getOrThrow: jest.fn().mockReturnValue(tableName) };

    return new ChatBroadcastService(
      { send: dynamoSend } as never,
      { send: managementSend } as never,
      configService as never,
    );
  }

  it('sends the event to every connection found for the chat room', async () => {
    const dynamoSend = jest.fn<(command: unknown) => Promise<unknown>>().mockResolvedValue({
      Items: [{ connectionId: 'conn-1' }, { connectionId: 'conn-2' }],
    });
    const managementSend = jest.fn<(command: unknown) => Promise<unknown>>().mockResolvedValue({});
    const service = createService(dynamoSend, managementSend);

    await service.broadcastToRoom(42n, 'message:new', { messageId: 1 });

    const queryCommand = dynamoSend.mock.calls[0]?.[0] as QueryCommand;
    expect(queryCommand.input.TableName).toBe(tableName);
    expect(queryCommand.input.IndexName).toBe('chatRoomId-index');
    expect(queryCommand.input.ExpressionAttributeValues).toEqual({ ':chatRoomId': '42' });

    expect(managementSend).toHaveBeenCalledTimes(2);
    const firstPost = managementSend.mock.calls[0]?.[0] as PostToConnectionCommand;
    expect(firstPost.input.ConnectionId).toBe('conn-1');
    const payload = JSON.parse(Buffer.from(firstPost.input.Data as Uint8Array).toString('utf8')) as {
      event: string;
      messageId: number;
    };
    expect(payload).toEqual({ event: 'message:new', messageId: 1 });
  });

  it('removes a connection from the table when it is gone', async () => {
    const dynamoSend = jest
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({ Items: [{ connectionId: 'stale-conn' }] })
      .mockResolvedValueOnce({});
    const goneError = new GoneException({ message: 'Gone', $metadata: {} });
    const managementSend = jest.fn<(command: unknown) => Promise<unknown>>().mockRejectedValue(goneError);
    const service = createService(dynamoSend, managementSend);

    await service.broadcastToRoom(42n, 'message:new', { messageId: 1 });

    expect(dynamoSend).toHaveBeenCalledTimes(2);
    const deleteCommand = dynamoSend.mock.calls[1]?.[0] as DeleteCommand;
    expect(deleteCommand.input.TableName).toBe(tableName);
    expect(deleteCommand.input.Key).toEqual({ connectionId: 'stale-conn', chatRoomId: '42' });
  });

  it('propagates errors other than GoneException', async () => {
    const dynamoSend = jest
      .fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({ Items: [{ connectionId: 'conn-1' }] });
    const managementSend = jest
      .fn<(command: unknown) => Promise<unknown>>()
      .mockRejectedValue(new Error('unexpected'));
    const service = createService(dynamoSend, managementSend);

    await expect(service.broadcastToRoom(42n, 'message:new', {})).rejects.toThrow('unexpected');
  });

  it('sends no post-to-connection calls when no connections are joined to the room', async () => {
    const dynamoSend = jest.fn<(command: unknown) => Promise<unknown>>().mockResolvedValue({ Items: [] });
    const managementSend = jest.fn<(command: unknown) => Promise<unknown>>();
    const service = createService(dynamoSend, managementSend);

    await service.broadcastToRoom(42n, 'message:new', {});

    expect(managementSend).not.toHaveBeenCalled();
  });
});
