import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatBroadcastService } from './chat-broadcast.service';
import { ChatService } from './chat.service';

type MockedPrisma = {
  chatRoom: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    delete: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  chatRoomMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    createMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    delete: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  message: {
    count: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  group: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  groupMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  $transaction: jest.MockedFunction<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>;
};

type MockedChatBroadcastService = {
  broadcastToRoom: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
};

describe('ChatService', () => {
  let service: ChatService;
  let prisma: MockedPrisma;
  let chatBroadcastService: MockedChatBroadcastService;

  beforeEach(() => {
    prisma = {
      chatRoom: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
        create: jest.fn<() => Promise<unknown>>(),
        delete: jest.fn<() => Promise<unknown>>(),
      },
      chatRoomMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        createMany: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
        delete: jest.fn<() => Promise<unknown>>(),
      },
      message: {
        count: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        create: jest.fn<() => Promise<unknown>>(),
      },
      group: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      groupMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    chatBroadcastService = {
      broadcastToRoom: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    };

    service = new ChatService(
      prisma as unknown as PrismaService,
      chatBroadcastService as unknown as ChatBroadcastService,
    );
  });

  describe('createChatRoom', () => {
    it('creates a chat room with the requested type', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 10n });
      prisma.groupMember.findUnique.mockResolvedValue({ userId: 1n, groupId: 10n, leftAt: null });
      prisma.chatRoom.create.mockResolvedValue({ id: 1n, type: 'NOTICE' });

      await service.createChatRoom(10n, '공지방', 1n, 'NOTICE' as never);

      expect(prisma.chatRoom.create).toHaveBeenCalledWith({
        data: {
          groupId: 10n,
          name: '공지방',
          type: 'NOTICE',
          createdBy: 1n,
          ownerId: 1n,
          members: { create: { userId: 1n } },
        },
      });
    });

    it('defaults the type to undefined so Prisma applies the schema default', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 10n });
      prisma.groupMember.findUnique.mockResolvedValue({ userId: 1n, groupId: 10n, leftAt: null });
      prisma.chatRoom.create.mockResolvedValue({ id: 1n, type: 'GROUP' });

      await service.createChatRoom(10n, '같이살림방', 1n);

      expect(prisma.chatRoom.create).toHaveBeenCalledWith({
        data: {
          groupId: 10n,
          name: '같이살림방',
          type: undefined,
          createdBy: 1n,
          ownerId: 1n,
          members: { create: { userId: 1n } },
        },
      });
    });
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
    it('allows the chat room owner to delete it', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });

      await service.deleteChatRoom(1n, 1n);

      expect(prisma.chatRoom.findUnique).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it('throws when a non-owner tries to delete the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });

      await expect(service.deleteChatRoom(1n, 2n)).rejects.toMatchObject({ code: 'COMMON_403' });
    });
  });

  describe('removeMember', () => {
    it('allows a member to remove themselves', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 2n });

      await service.removeMember(1n, 2n, 2n);

      expect(prisma.chatRoomMember.findUnique).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: 1n, userId: 2n } },
      });
    });

    it('allows the chat room owner to remove another member', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 2n });

      await service.removeMember(1n, 2n, 1n);

      expect(prisma.chatRoomMember.findUnique).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: 1n, userId: 2n } },
      });
    });

    it('throws when a non-owner tries to remove someone else', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });

      await expect(service.removeMember(1n, 2n, 3n)).rejects.toMatchObject({ code: 'COMMON_403' });
    });

    it('throws when the owner tries to leave without transferring ownership first', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });

      await expect(service.removeMember(1n, 1n, 1n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_OWNER_MUST_TRANSFER_BEFORE_LEAVING',
      });
      expect(prisma.chatRoomMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    it('allows the current owner to transfer ownership to another member', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 2n });
      prisma.chatRoom.update.mockResolvedValue({ id: 1n, ownerId: 2n });

      await service.transferOwnership(1n, 2n, 1n);

      expect(prisma.chatRoom.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { ownerId: 2n },
      });
    });

    it('throws when a non-owner tries to transfer ownership', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });

      await expect(service.transferOwnership(1n, 2n, 3n)).rejects.toMatchObject({ code: 'COMMON_403' });
      expect(prisma.chatRoom.update).not.toHaveBeenCalled();
    });

    it('throws when the target user is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n, ownerId: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.transferOwnership(1n, 99n, 1n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
      expect(prisma.chatRoom.update).not.toHaveBeenCalled();
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

    it('enriches each chat room with lastMessage, unreadCount, and memberCount', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ userId: 1n, groupId: 10n, leftAt: null });
      prisma.chatRoom.findMany.mockResolvedValue([
        {
          id: 1n,
          groupId: 10n,
          name: '같이살림방',
          isDefault: true,
          createdBy: 1n,
          createdAt: new Date('2026-01-01'),
          _count: { members: 3 },
          messages: [{ id: 5n, content: '안녕', senderId: 2n, createdAt: new Date('2026-01-02') }],
          members: [{ lastReadAt: new Date('2026-01-01'), joinedAt: new Date('2025-12-01') }],
        },
      ]);
      prisma.message.count.mockResolvedValue(4);

      const result = await service.listChatRooms(10n, 1n);

      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          chatRoomId: 1n,
          senderId: { not: 1n },
          createdAt: { gt: new Date('2026-01-01') },
        },
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 1n,
          memberCount: 3,
          unreadCount: 4,
          lastMessage: { id: 5n, content: '안녕', senderId: 2n, createdAt: new Date('2026-01-02') },
        }),
      ]);
    });

    it('falls back to joinedAt when a member has never marked messages as read', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ userId: 1n, groupId: 10n, leftAt: null });
      prisma.chatRoom.findMany.mockResolvedValue([
        {
          id: 1n,
          groupId: 10n,
          name: '같이살림방',
          isDefault: true,
          createdBy: 1n,
          createdAt: new Date('2026-01-01'),
          _count: { members: 3 },
          messages: [],
          members: [{ lastReadAt: null, joinedAt: new Date('2026-01-05') }],
        },
      ]);
      prisma.message.count.mockResolvedValue(2);

      await service.listChatRooms(10n, 1n);

      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          chatRoomId: 1n,
          senderId: { not: 1n },
          createdAt: { gt: new Date('2026-01-05') },
        },
      });
    });

    it('returns zero unreadCount without querying messages when the requester is not a room member', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ userId: 1n, groupId: 10n, leftAt: null });
      prisma.chatRoom.findMany.mockResolvedValue([
        {
          id: 1n,
          groupId: 10n,
          name: '같이살림방',
          isDefault: true,
          createdBy: 1n,
          createdAt: new Date('2026-01-01'),
          _count: { members: 3 },
          messages: [],
          members: [],
        },
      ]);

      const result = await service.listChatRooms(10n, 1n);

      expect(prisma.message.count).not.toHaveBeenCalled();
      expect(result).toEqual([expect.objectContaining({ unreadCount: 0 })]);
    });
  });

  describe('updateMemberSettings', () => {
    it('updates the requesting member own notification and pin settings', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 1n });
      prisma.chatRoomMember.update.mockResolvedValue({ userId: 1n, notificationEnabled: false, isPinned: true });

      await service.updateMemberSettings(1n, 1n, { notificationEnabled: false, isPinned: true });

      expect(prisma.chatRoomMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chatRoomId_userId: { chatRoomId: 1n, userId: 1n } },
          data: { notificationEnabled: false, isPinned: true },
        }),
      );
    });

    it('throws when the requester is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.updateMemberSettings(1n, 99n, { isPinned: true })).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
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

    it('includes the sender nickname and profile image for each message', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 1n });
      prisma.message.findMany.mockResolvedValue([]);

      await service.listMessages(1n, 1n);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            sender: { select: { id: true, nickname: true, profileImage: true } },
          },
        }),
      );
    });
  });

  describe('createTextMessage', () => {
    it('broadcasts the created message to the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 1n });
      const message = { id: 10n, chatRoomId: 1n, senderId: 1n, type: 'TEXT', content: '안녕하세요' };
      prisma.message.create.mockResolvedValue(message);

      const result = await service.createTextMessage(1n, 1n, '안녕하세요');

      expect(result).toEqual(message);
      expect(chatBroadcastService.broadcastToRoom).toHaveBeenCalledWith(1n, 'message:new', message);
    });

    it('throws when the requester is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.createTextMessage(1n, 99n, '안녕하세요')).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
      expect(chatBroadcastService.broadcastToRoom).not.toHaveBeenCalled();
    });
  });

  describe('createCardMessage', () => {
    it('broadcasts the created message to the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ userId: 1n });
      const message = { id: 11n, chatRoomId: 1n, senderId: 1n, type: 'CARD_RULE', content: '', refId: 5n };
      prisma.message.create.mockResolvedValue(message);

      const result = await service.createCardMessage(1n, 1n, 'CARD_RULE', 5n);

      expect(result).toEqual(message);
      expect(chatBroadcastService.broadcastToRoom).toHaveBeenCalledWith(1n, 'message:new', message);
    });

    it('throws when the requester is not a member of the chat room', async () => {
      prisma.chatRoom.findUnique.mockResolvedValue({ id: 1n, createdBy: 1n });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.createCardMessage(1n, 99n, 'CARD_RULE', 5n)).rejects.toMatchObject({
        code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
      });
      expect(chatBroadcastService.broadcastToRoom).not.toHaveBeenCalled();
    });
  });
});
