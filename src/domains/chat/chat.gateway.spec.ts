import { Socket } from 'socket.io';

import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
  it('returns pong response for ping messages', () => {
    const gateway = new ChatGateway();
    const client = { id: 'socket-1' } as Socket;

    expect(gateway.handlePing({ value: 'hello' }, client)).toEqual({
      event: 'pong',
      data: {
        clientId: 'socket-1',
        payload: {
          value: 'hello',
        },
      },
    });
  });
});
