import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from './chat.service';

type MockedPrisma = {
  chatRoom: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    delete: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  chatRoomMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    createMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    delete: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
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
        delete: jest.fn<() => Promise<unknown>>(),
      },
      chatRoomMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        createMany: jest.fn<() => Promise<unknown>>(),
        delete: jest.fn<() => Promise<unknown>>(),
      },
      groupMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    service = new ChatService(prisma as unknown as PrismaService);
  });

  describe('inviteMember', () => {
    it('invites multiple members at once when the inviter is a member and invitees are all active group members', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n, createdBy: 1n });
      prisma.chatRoomMember.findUnique
        .mockResolvedValueOnce({ userId: 1n }) // inviter membership check
        .mockResolvedValueOnce(null) // invitee 2 not already joined
        .mockResolvedValueOnce(null); // invitee 3 not already joined
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
        .mockResolvedValueOnce({ userId: 3n, groupId: 10n, leftAt: null });
      prisma.chatRoomMember.findMany.mockResolvedValue([
        { userId: 2n, joinedAt: new Date(), lastReadAt: null, user: { id: 2n, nickname: 'A', profileImage: null } },
        { userId: 3n, joinedAt: new Date(), lastReadAt: null, user: { id: 3n, nickname: 'B', profileImage: null } },
      ]);

      const result = await service.inviteMember(1n, [2n, 3n], 1n);

      expect(result).toHaveLength(2);
      expect(prisma.chatRoomMember.createMany).toHaveBeenCalledWith({
        data: [
          { chatRoomId: 1n, userId: 2n },
          { chatRoomId: 1n, userId: 3n },
        ],
      });
    });

    it('throws when the inviter is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValueOnce(null);

      await expect(service.inviteMember(1n, [2n], 99n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
      expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
    });

    it('throws and creates nothing when one of the invitees is not an active group member', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n, createdBy: 1n });
      prisma.chatRoomMember.findUnique
        .mockResolvedValueOnce({ userId: 1n })
        .mockResolvedValueOnce(null);
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
        .mockResolvedValueOnce(null);

      await expect(service.inviteMember(1n, [2n, 999n], 1n)).rejects.toMatchObject({
        code: 'GROUP_MEMBER_NOT_FOUND',
      });
      expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
    });

    it('throws and creates nothing when one of the invitees already joined', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, groupId: 10n, createdBy: 1n });
      prisma.chatRoomMember.findUnique
        .mockResolvedValueOnce({ userId: 1n })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ chatRoomId: 1n, userId: 3n });
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ userId: 2n, groupId: 10n, leftAt: null })
        .mockResolvedValueOnce({ userId: 3n, groupId: 10n, leftAt: null });

      await expect(service.inviteMember(1n, [2n, 3n], 1n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_ALREADY_JOINED',
      });
      expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
    });

    it('throws when the chat room does not exist', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue(null);

      await expect(service.inviteMember(999n, [2n], 1n)).rejects.toBeInstanceOf(BusinessException);
      expect(prisma.chatRoomMember.createMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteChatRoom', () => {
    it('allows the chat room creator to delete it', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });

      await service.deleteChatRoom(1n, 1n);

      expect(prisma.chatRoom.findUnique).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it('throws when a non-creator tries to delete the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });

      await expect(service.deleteChatRoom(1n, 2n)).rejects.toMatchObject({ code: 'COMMON_403' });
    });
  });

  describe('removeMember', () => {
    it('allows a member to remove themselves', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 2n });

      await service.removeMember(1n, 2n, 2n);

      expect(prisma.chatRoomMember.findUnique).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: 1n, userId: 2n } },
      });
    });

    it('allows the chat room creator to remove another member', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 2n });

      await service.removeMember(1n, 2n, 1n);

      expect(prisma.chatRoomMember.findUnique).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: 1n, userId: 2n } },
      });
    });

    it('throws when a non-creator tries to remove someone else', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });

      await expect(service.removeMember(1n, 2n, 3n)).rejects.toMatchObject({ code: 'COMMON_403' });
    });
  });

  describe('getChatRoomDetail', () => {
    it('throws when the requester is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.getChatRoomDetail(1n, 99n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
    });
  });

  describe('listChatRooms', () => {
    it('throws when the requester is not an active member of the group', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);

      await expect(service.listChatRooms(10n, 99n)).rejects.toMatchObject({
        code: 'GROUP_MEMBER_NOT_FOUND',
      });
    });
  });

  describe('listMessages', () => {
    it('throws when the requester is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.listMessages(1n, 99n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
    });
  });
});
