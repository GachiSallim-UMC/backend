import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from './chat.service';

type MockedPrisma = {
  chatRoom: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  chatRoomMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    createMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  groupMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  $transaction: jest.MockedFunction<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>;
};

describe('ChatService', () => {
  let service: ChatService;
  let prisma: MockedPrisma;

  beforeEach(() => {
    prisma = {
      chatRoom: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      chatRoomMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        createMany: jest.fn<() => Promise<unknown>>(),
      },
      groupMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    service = new ChatService(prisma as unknown as PrismaService);
  });

  it('invites multiple members at once when they are all active group members', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
      .mockResolvedValueOnce({ userId: 3n, groupId: 10n, leftAt: null });
    prisma.chatRoomMember.findUnique.mockResolvedValue(null);
    prisma.chatRoomMember.findMany.mockResolvedValue([
      { userId: 2n, joinedAt: new Date(), lastReadAt: null, user: { id: 2n, nickname: 'A', profileImage: null } },
      { userId: 3n, joinedAt: new Date(), lastReadAt: null, user: { id: 3n, nickname: 'B', profileImage: null } },
    ]);

    const result = await service.inviteMember(1n, [2n, 3n]);

    expect(result).toHaveLength(2);
    expect(prisma.chatRoomMember.createMany).toHaveBeenCalledWith({
      data: [
        { chatRoomId: 1n, userId: 2n },
        { chatRoomId: 1n, userId: 3n },
      ],
    });
  });

  it('throws and creates nothing when one of the invitees is not an active group member', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
      .mockResolvedValueOnce(null);

    await expect(service.inviteMember(1n, [2n, 999n])).rejects.toMatchObject({
      code: 'GROUP_MEMBER_NOT_FOUND',
    });
    expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
  });

  it('throws and creates nothing when one of the invitees already joined', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
      .mockResolvedValueOnce({ userId: 3n, groupId: 10n, leftAt: null });
    prisma.chatRoomMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ chatRoomId: 1n, userId: 3n });

    await expect(service.inviteMember(1n, [2n, 3n])).rejects.toMatchObject({
      code: 'CHAT_ROOM_MEMBER_ALREADY_JOINED',
    });
    expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
  });

  it('throws when the chat room does not exist', async () => {
    prisma.chatRoom.findUnique.mockResolvedValue(null);

    await expect(service.inviteMember(999n, [2n])).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
  });
});
