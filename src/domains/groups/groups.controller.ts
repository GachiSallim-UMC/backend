import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { parseBigIntId } from '../../common/utils/id.util';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupPermissionResponseDto } from './dto/group-permission-response.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupPermissionDto } from './dto/update-group-permission.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { GroupsAuthenticatedUserService } from './groups-authenticated-user.service';
import { GroupsService } from './groups.service';

@ApiTags('그룹 관리 (GROUP)')
@ApiBearerAuth('BearerAuth')
@UseGuards(CognitoAccessTokenGuard)
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly authenticatedUsers: GroupsAuthenticatedUserService,
  ) {}

  @Get()
  async listGroups(@CurrentAuth() auth: AuthContext) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.listGroups(userId);
  }

  @Post()
  async createGroup(@CurrentAuth() auth: AuthContext, @Body() dto: CreateGroupDto) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.createGroup(dto, userId);
  }

  @Post('join')
  async joinGroup(@CurrentAuth() auth: AuthContext, @Body() dto: JoinGroupDto) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.joinGroup(dto, userId);
  }

  @Post(':groupId/invite-code')
  async reissueInviteCode(@CurrentAuth() auth: AuthContext, @Param('groupId') groupId: string) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.reissueInviteCode(parseBigIntId(groupId, 'groupId'), userId);
  }

  @Get(':groupId')
  async getGroupDetail(@CurrentAuth() auth: AuthContext, @Param('groupId') groupId: string) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.getGroupDetail(parseBigIntId(groupId, 'groupId'), userId);
  }

  @Patch(':groupId')
  async updateGroup(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.updateGroup(parseBigIntId(groupId, 'groupId'), dto, userId);
  }

  @Get(':groupId/permissions')
  @ApiOperation({ summary: '그룹 권한 설정 조회', description: '그룹의 멤버 권한 설정을 조회합니다.' })
  @ApiParam({ name: 'groupId', type: Number, description: '그룹 ID' })
  @ApiResponse({ status: 200, description: '그룹 권한 설정 조회 성공', type: GroupPermissionResponseDto })
  @ApiResponse({ status: 400, description: 'COMMON_BAD_REQUEST - 요청 파라미터가 잘못되었습니다.' })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: 'GROUP_MEMBER_NOT_FOUND - 그룹에 속하지 않은 사용자입니다.' })
  @ApiResponse({ status: 404, description: 'GROUP_NOT_FOUND - 그룹이 존재하지 않는 경우' })
  async getGroupPermission(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId') groupId: string,
  ): Promise<GroupPermissionResponseDto> {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.getGroupPermission(parseBigIntId(groupId, 'groupId'), userId);
  }

  @Patch(':groupId/permissions')
  @ApiOperation({ summary: '그룹 권한 설정 수정', description: '그룹의 멤버 권한 설정을 수정합니다. 관리자만 가능합니다.' })
  @ApiParam({ name: 'groupId', type: Number, description: '그룹 ID' })
  @ApiResponse({ status: 200, description: '그룹 권한 설정 수정 성공', type: GroupPermissionResponseDto })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (COMMON_BAD_REQUEST) 또는 DTO 검증 실패 (COMMON_INVALID_PARAMETER)',
  })
  @ApiResponse({ status: 401, description: '인증이 필요합니다.' })
  @ApiResponse({ status: 403, description: 'GROUP_FORBIDDEN - 그룹 관리자만 수행할 수 있는 작업입니다.' })
  @ApiResponse({ status: 404, description: 'GROUP_NOT_FOUND - 그룹이 존재하지 않는 경우' })
  async updateGroupPermission(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupPermissionDto,
  ): Promise<GroupPermissionResponseDto> {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.updateGroupPermission(parseBigIntId(groupId, 'groupId'), dto, userId);
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(@CurrentAuth() auth: AuthContext, @Param('groupId') groupId: string) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.deleteGroup(parseBigIntId(groupId, 'groupId'), userId);
  }

  @Get(':groupId/members')
  async listMembers(@CurrentAuth() auth: AuthContext, @Param('groupId') groupId: string) {
    const userId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.listMembers(parseBigIntId(groupId, 'groupId'), userId);
  }

  @Patch(':groupId/members/:userId/role')
  async updateMemberRole(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.updateMemberRole(
      parseBigIntId(groupId, 'groupId'),
      parseBigIntId(targetUserId, 'userId'),
      dto,
      currentUserId,
    );
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    const currentUserId = await this.authenticatedUsers.resolveActiveUserId(auth.cognitoSub);
    return this.groupsService.removeMember(
      parseBigIntId(groupId, 'groupId'),
      parseBigIntId(targetUserId, 'userId'),
      currentUserId,
    );
  }
}
