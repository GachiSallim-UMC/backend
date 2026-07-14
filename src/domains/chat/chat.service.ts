import { Injectable } from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CardMessageType } from './dto/create-card-message.dto';

const CHAT_ROOM_MEMBER_SELECT = {
  userId: true,
  joinedAt: true,
  lastReadAt: true,
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
  constructor(private readonly prisma: PrismaService) {}

  async listChatRooms(groupId: bigint) {
    return this.prisma.chatRoom.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createChatRoom(groupId: bigint, name: string, createdBy: bigint) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });

    if (!group) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    await this.findActiveGroupMemberOrThrow(groupId, createdBy);

    return this.prisma.chatRoom.create({
      data: {
        groupId,
        name,
        createdBy,
        members: {
          create: { userId: createdBy },
        },
      },
    });
  }

  async getChatRoomDetail(roomId: bigint) {
    const chatRoom = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { members: { select: CHAT_ROOM_MEMBER_SELECT } },
    });

    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    return chatRoom;
  }

  async deleteChatRoom(roomId: bigint): Promise<void> {
    await this.findChatRoomOrThrow(roomId);

    await this.prisma.chatRoom.delete({ where: { id: roomId } });
  }

  async inviteMember(roomId: bigint, userId: bigint) {
    const chatRoom = await this.findChatRoomOrThrow(roomId);
    await this.findActiveGroupMemberOrThrow(chatRoom.groupId, userId);

    const existingMember = await this.prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
    });

    if (existingMember) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_ALREADY_JOINED);
    }

    return this.prisma.chatRoomMember.create({
      data: { chatRoomId: roomId, userId },
      select: CHAT_ROOM_MEMBER_SELECT,
    });
  }

  async removeMember(roomId: bigint, userId: bigint): Promise<void> {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, userId);

    await this.prisma.chatRoomMember.delete({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
    });
  }

  async listMessages(roomId: bigint, before?: bigint, limit = 30) {
    await this.findChatRoomOrThrow(roomId);

    return this.prisma.message.findMany({
      where: {
        chatRoomId: roomId,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  async createTextMessage(roomId: bigint, senderId: bigint, content: string) {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, senderId);

    return this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderId,
        type: MessageType.TEXT,
        content,
      },
    });
  }

  async createCardMessage(
    roomId: bigint,
    senderId: bigint,
    type: CardMessageType,
    refId: bigint,
    content?: string,
  ) {
    await this.findChatRoomOrThrow(roomId);
    await this.findChatRoomMemberOrThrow(roomId, senderId);

    return this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderId,
        type,
        content: content ?? '',
        refId,
      },
    });
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
