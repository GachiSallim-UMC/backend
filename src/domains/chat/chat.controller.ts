import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { parseBigIntId } from '../../common/utils/id.util';
import { ChatService } from './chat.service';
import { CreateCardMessageDto } from './dto/create-card-message.dto';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { MarkReadDto } from './dto/mark-read.dto';

@ApiTags('chat-rooms')
@ApiBearerAuth('BearerAuth')
@Controller('chat-rooms')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  listChatRooms(@Query() query: ListChatRoomsQueryDto) {
    const groupId = parseBigIntId(query.groupId, 'groupId');

    return this.chatService.listChatRooms(groupId);
  }

  @Post()
  createChatRoom(@Body() dto: CreateChatRoomDto) {
    const groupId = parseBigIntId(dto.groupId, 'groupId');
    const createdBy = parseBigIntId(dto.createdBy, 'createdBy');

    return this.chatService.createChatRoom(groupId, dto.name, createdBy);
  }

  @Get(':roomId')
  getChatRoomDetail(@Param('roomId') roomId: string) {
    return this.chatService.getChatRoomDetail(parseBigIntId(roomId, 'roomId'));
  }

  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChatRoom(@Param('roomId') roomId: string) {
    return this.chatService.deleteChatRoom(parseBigIntId(roomId, 'roomId'));
  }

  @Post(':roomId/members')
  inviteMember(@Param('roomId') roomId: string, @Body() dto: InviteMemberDto) {
    return this.chatService.inviteMember(parseBigIntId(roomId, 'roomId'), parseBigIntId(dto.userId, 'userId'));
  }

  @Delete(':roomId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param('roomId') roomId: string, @Param('userId') userId: string) {
    return this.chatService.removeMember(parseBigIntId(roomId, 'roomId'), parseBigIntId(userId, 'userId'));
  }

  @Get(':roomId/messages')
  listMessages(@Param('roomId') roomId: string, @Query() query: ListMessagesQueryDto) {
    const before = query.before ? parseBigIntId(query.before, 'before') : undefined;

    return this.chatService.listMessages(parseBigIntId(roomId, 'roomId'), before, query.limit);
  }

  @Post(':roomId/messages')
  sendMessage(@Param('roomId') roomId: string, @Body() dto: CreateMessageDto) {
    return this.chatService.createTextMessage(
      parseBigIntId(roomId, 'roomId'),
      parseBigIntId(dto.senderId, 'senderId'),
      dto.content,
    );
  }

  @Post(':roomId/messages/card')
  sendCardMessage(@Param('roomId') roomId: string, @Body() dto: CreateCardMessageDto) {
    return this.chatService.createCardMessage(
      parseBigIntId(roomId, 'roomId'),
      parseBigIntId(dto.senderId, 'senderId'),
      dto.type,
      parseBigIntId(dto.refId, 'refId'),
      dto.content,
    );
  }

  @Patch(':roomId/read')
  markAsRead(@Param('roomId') roomId: string, @Body() dto: MarkReadDto) {
    return this.chatService.markAsRead(parseBigIntId(roomId, 'roomId'), parseBigIntId(dto.userId, 'userId'));
  }
}
