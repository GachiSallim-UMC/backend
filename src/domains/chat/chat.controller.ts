import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { parseBigIntId } from '../../common/utils/id.util';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { ChatAuthenticatedUserService } from './chat-authenticated-user.service';
import { ChatService } from './chat.service';
import { CreateCardMessageDto } from './dto/create-card-message.dto';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { TransferChatRoomOwnerDto } from './dto/transfer-chat-room-owner.dto';
import { UpdateChatRoomMemberSettingsDto } from './dto/update-chat-room-member-settings.dto';

@ApiTags('chat-rooms')
@ApiBearerAuth('BearerAuth')
@UseGuards(CognitoAccessTokenGuard)
@Controller('chat-rooms')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly authenticatedUsers: ChatAuthenticatedUserService,
  ) {}

  @Get()
  async listChatRooms(@CurrentAuth() auth: AuthContext, @Query() query: ListChatRoomsQueryDto) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    const groupId = parseBigIntId(query.groupId, 'groupId');

    return this.chatService.listChatRooms(groupId, currentUserId);
  }

  @Post()
  async createChatRoom(@CurrentAuth() auth: AuthContext, @Body() dto: CreateChatRoomDto) {
    const createdBy = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    const groupId = parseBigIntId(dto.groupId, 'groupId');

    return this.chatService.createChatRoom(groupId, dto.name, createdBy, dto.type);
  }

  @Get(':roomId')
  async getChatRoomDetail(@CurrentAuth() auth: AuthContext, @Param('roomId') roomId: string) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.getChatRoomDetail(parseBigIntId(roomId, 'roomId'), currentUserId);
  }

  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChatRoom(@CurrentAuth() auth: AuthContext, @Param('roomId') roomId: string) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.deleteChatRoom(parseBigIntId(roomId, 'roomId'), currentUserId);
  }

  @Patch(':roomId/owner')
  async transferOwnership(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Body() dto: TransferChatRoomOwnerDto,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.transferOwnership(
      parseBigIntId(roomId, 'roomId'),
      parseBigIntId(dto.userId, 'userId'),
      currentUserId,
    );
  }

  @Post(':roomId/members')
  async inviteMember(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Body() dto: InviteMemberDto,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    const userIds = dto.userIds.map((userId) => parseBigIntId(userId, 'userIds'));

    return this.chatService.inviteMember(parseBigIntId(roomId, 'roomId'), userIds, currentUserId);
  }

  @Patch(':roomId/members/me')
  async updateMemberSettings(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateChatRoomMemberSettingsDto,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.updateMemberSettings(parseBigIntId(roomId, 'roomId'), currentUserId, dto);
  }

  @Delete(':roomId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.removeMember(
      parseBigIntId(roomId, 'roomId'),
      parseBigIntId(userId, 'userId'),
      currentUserId,
    );
  }

  @Get(':roomId/messages')
  async listMessages(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    const before = query.before ? parseBigIntId(query.before, 'before') : undefined;

    return this.chatService.listMessages(parseBigIntId(roomId, 'roomId'), currentUserId, before, query.limit);
  }

  @Post(':roomId/messages')
  async sendMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const senderId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.createTextMessage(parseBigIntId(roomId, 'roomId'), senderId, dto.content);
  }

  @Post(':roomId/messages/card')
  async sendCardMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId') roomId: string,
    @Body() dto: CreateCardMessageDto,
  ) {
    const senderId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.createCardMessage(
      parseBigIntId(roomId, 'roomId'),
      senderId,
      dto.type,
      parseBigIntId(dto.refId, 'refId'),
      dto.content,
    );
  }

  @Patch(':roomId/read')
  async markAsRead(@CurrentAuth() auth: AuthContext, @Param('roomId') roomId: string) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.chatService.markAsRead(parseBigIntId(roomId, 'roomId'), userId);
  }
}
