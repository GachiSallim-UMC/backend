import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { parseBigIntId } from '../../common/utils/id.util';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  listGroups(@Headers('x-user-id') userId: string) {
    return this.groupsService.listGroups(this.requireUserId(userId));
  }

  @Post()
  createGroup(@Headers('x-user-id') userId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(dto, this.requireUserId(userId));
  }

  @Get(':groupId')
  getGroupDetail(@Headers('x-user-id') userId: string, @Param('groupId') groupId: string) {
    return this.groupsService.getGroupDetail(parseBigIntId(groupId, 'groupId'), this.requireUserId(userId));
  }

  @Patch(':groupId')
  updateGroup(@Headers('x-user-id') userId: string, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.updateGroup(parseBigIntId(groupId, 'groupId'), dto, this.requireUserId(userId));
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Headers('x-user-id') userId: string, @Param('groupId') groupId: string) {
    return this.groupsService.deleteGroup(parseBigIntId(groupId, 'groupId'), this.requireUserId(userId));
  }

  @Get(':groupId/members')
  listMembers(@Headers('x-user-id') userId: string, @Param('groupId') groupId: string) {
    return this.groupsService.listMembers(parseBigIntId(groupId, 'groupId'), this.requireUserId(userId));
  }

  @Patch(':groupId/members/:userId/role')
  updateMemberRole(
    @Headers('x-user-id') currentUserId: string,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.groupsService.updateMemberRole(
      parseBigIntId(groupId, 'groupId'),
      parseBigIntId(targetUserId, 'userId'),
      dto,
      this.requireUserId(currentUserId),
    );
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Headers('x-user-id') currentUserId: string,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.groupsService.removeMember(
      parseBigIntId(groupId, 'groupId'),
      parseBigIntId(targetUserId, 'userId'),
      this.requireUserId(currentUserId),
    );
  }

  private requireUserId(userIdHeader?: string): bigint {
    if (!userIdHeader) {
      throw new BusinessException(ErrorCode.COMMON_UNAUTHORIZED);
    }

    return parseBigIntId(userIdHeader, 'x-user-id');
  }
}
