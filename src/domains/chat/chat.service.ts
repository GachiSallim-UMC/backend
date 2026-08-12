import { Injectable, Logger } from '@nestjs/common';
import { ChatRoomType, MessageType, NotificationType, Prisma } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatBroadcastService } from './chat-broadcast.service';
import { CardMessageType } from './dto/create-card-message.dto';

const NEW_MESSAGE_PREVIEW_LENGTH = 50;

const CHAT_ROOM_MEMBER_SELECT = {
  userId: true,
  joinedAt: true,
  lastReadAt: true,
  notificationEnabled: true,
  isPinned: true,
  user: {
    select: {
      id: true,
      nickname: true,
      profileImage: true,
    },
  },
} satisfies Prisma.ChatRoomMemberSelect;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatBroadcastService: ChatBroadcastService,
    private readonly notificationDelivery: NotificationDeliveryService,
  ) {}

  async listChatRooms(groupId: bigint, currentUserId: bigint) {
    await this.findActiveGroupMemberOrThrow(groupId, currentUserId);

    const chatRooms = await this.prisma.chatRoom.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { members: true } },
        messages: {
          orderBy: { id: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, nickname: true, profileImage: true } } },
        },
        members: {
          where: { userId: currentUserId },
          select: { lastReadAt: true, joinedAt: true, isPinned: true },
        },
      },
    });

    return Promise.all(
      chatRooms.map(async ({ _count, messages, members, ...room }) => {
        const membership = members[0];
        const unreadCount = membership
          ? await this.prisma.message.count({
              where: {
                chatRoomId: room.id,
                senderId: { not: currentUserId },
                createdAt: { gt: membership.lastReadAt ?? membership.joinedAt },
              },
            })
          : 0;

        return {
          ...room,
          memberCount: _count.members,
          lastMessage: messages[0] ?? null,
          unreadCount,
          isPinned: membership?.isPinned ?? false,
        };
      }),
    );
  }

  async createChatRoom(groupId: bigint, name: string, createdBy: bigint, type?: ChatRoomType) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });

    if (!group) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    await this.findActiveGroupMemberOrThrow(groupId, createdBy);

    return this.prisma.chatRoom.create({
      data: {
        groupId,
        name,
        type,
        createdBy,
        ownerId: createdBy,
        members: {
          create: { userId: createdBy },
        },
      },
    });
  }

  async getChatRoomDetail(roomId: bigint, currentUserId: bigint) {
    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { members: { select: CHAT_ROOM_MEMBER_SELECT } },
    });

    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    await this.findChatRoomMemberOrThrow(roomId, currentUserId);

    return chatRoom;
  }

  async deleteChatRoom(roomId: bigint, currentUserId: bigint): Promise<void> {
    const chatRoom = await this.findChatRoomOrThrow(roomId);

    if (chatRoom.ownerId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    await this.prisma.chatRoom.delete({ where: { id: roomId } });
  }

  async inviteMember(roomId: bigint, userIds: bigint[], currentUserId: bigint) {
    const chatRoom = await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, currentUserId);

    return this.prisma.$transaction(async (tx) => {
      for (const userId of userIds) {
        const member = await tx.groupMember.findUnique({
          where: { userId_groupId: { userId, groupId: chatRoom.groupId } },
        });

        if (!member || member.leftAt) {
          throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
        }

        const existingMember = await tx.chatRoomMember.findUnique({
          where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
        });

        if (existingMember) {
          throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_ALREADY_JOINED);
        }
      }

      await tx.chatRoomMember.createMany({
        data: userIds.map((userId) => ({ chatRoomId: roomId, userId })),
      });

      return tx.chatRoomMember.findMany({
        where: { chatRoomId: roomId, userId: { in: userIds } },
        select: CHAT_ROOM_MEMBER_SELECT,
      });
    });
  }

  async removeMember(roomId: bigint, userId: bigint, currentUserId: bigint): Promise<void> {
    const chatRoom = await this.findChatRoomOrThrow(roomId);

    if (currentUserId !== userId && chatRoom.ownerId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    if (userId === chatRoom.ownerId) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_OWNER_MUST_TRANSFER_BEFORE_LEAVING);
    }

    await this.findChatRoomMemberOrThrow(roomId, userId);

    await this.prisma.chatRoomMember.delete({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
    });
  }

  async transferOwnership(roomId: bigint, newOwnerId: bigint, currentUserId: bigint) {
    const chatRoom = await this.findChatRoomOrThrow(roomId);

    if (chatRoom.ownerId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    await this.findChatRoomMemberOrThrow(roomId, newOwnerId);

    return this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { ownerId: newOwnerId },
    });
  }

  async listMessages(roomId: bigint, currentUserId: bigint, before?: bigint, limit = 30) {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, currentUserId);

    return this.prisma.message.findMany({
      where: {
        chatRoomId: roomId,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, nickname: true, profileImage: true },
        },
      },
    });
  }

  async createTextMessage(roomId: bigint, senderId: bigint, content: string) {
    const chatRoom = await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, senderId);

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderId,
        type: MessageType.TEXT,
        content,
      },
    });

    await this.chatBroadcastService.broadcastToRoom(roomId, 'message:new', message);
    await this.notifyNewMessage(chatRoom.groupId, roomId, senderId, content.slice(0, NEW_MESSAGE_PREVIEW_LENGTH));

    return message;
  }

  async createCardMessage(
    roomId: bigint,
    senderId: bigint,
    type: CardMessageType,
    refId: bigint,
    content?: string,
  ) {
    const chatRoom = await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, senderId);

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderId,
        type,
        content: content ?? '',
        refId,
      },
    });

    await this.chatBroadcastService.broadcastToRoom(roomId, 'message:new', message);
    await this.notifyNewMessage(chatRoom.groupId, roomId, senderId, '카드 메시지를 보냈습니다.');

    return message;
  }

  async markAsRead(roomId: bigint, userId: bigint) {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, userId);

    return this.prisma.chatRoomMember.update({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
      data: { lastReadAt: new Date() },
      select: CHAT_ROOM_MEMBER_SELECT,
    });
  }

  async updateMemberSettings(
    roomId: bigint,
    currentUserId: bigint,
    settings: { notificationEnabled?: boolean; isPinned?: boolean },
  ) {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, currentUserId);

    return this.prisma.chatRoomMember.update({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId: currentUserId } },
      data: settings,
      select: CHAT_ROOM_MEMBER_SELECT,
    });
  }

  private async findChatRoomOrThrow(roomId: bigint) {
    const chatRoom = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });

    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    return chatRoom;
  }

  private async findChatRoomMemberOrThrow(roomId: bigint, userId: bigint) {
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
    });

    if (!member) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_NOT_FOUND);
    }

    return member;
  }

  private async notifyNewMessage(
    groupId: bigint,
    chatRoomId: bigint,
    senderId: bigint,
    previewMessage: string,
  ): Promise<void> {
    try {
      const recipients = await this.prisma.chatRoomMember.findMany({
        where: {
          chatRoomId,
          userId: { not: senderId },
          notificationEnabled: true,
          user: { groupMembers: { some: { groupId, leftAt: null } } },
        },
        select: { userId: true },
      });

      await Promise.all(
        recipients.map(({ userId }) =>
          this.notificationDelivery.createNotification({
            userId,
            groupId,
            type: NotificationType.NEW_MESSAGE,
            refId: chatRoomId,
            message: previewMessage,
          }),
        ),
      );
    } catch (error) {
      // Notification delivery is a best-effort side effect; a failure here must not
      // fail message creation or the realtime broadcast that already succeeded.
      this.logger.error('Failed to send new message notifications', error);
    }
  }

  private async findActiveGroupMemberOrThrow(groupId: bigint, userId: bigint) {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    return member;
  }
}
