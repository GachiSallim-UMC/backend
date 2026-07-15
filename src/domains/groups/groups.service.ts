import { Injectable } from '@nestjs/common';
import { GroupRole } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroups(userId: bigint) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, leftAt: null, group: { isDeleted: false } },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((membership) => membership.group);
  }

  async createGroup(dto: CreateGroupDto, createdBy: bigint) {
    return this.prisma.group.create({
      data: {
        name: dto.name,
        description: dto.description,
        maxMembers: dto.maxMembers,
        inviteExpiredAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
        createdBy,
        members: {
          create: { userId: createdBy, role: GroupRole.ADMIN },
        },
      },
    });
  }

  async getGroupDetail(groupId: bigint, currentUserId: bigint) {
    const group = await this.findGroupOrThrow(groupId);
    await this.requireActiveMemberOrThrow(groupId, currentUserId);

    return group;
  }

  async updateGroup(groupId: bigint, dto: UpdateGroupDto, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    return this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.maxMembers !== undefined ? { maxMembers: dto.maxMembers } : {}),
      },
    });
  }

  async deleteGroup(groupId: bigint, currentUserId: bigint): Promise<void> {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    await this.prisma.group.update({
      where: { id: groupId },
      data: { isDeleted: true },
    });
  }

  async listMembers(groupId: bigint, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireActiveMemberOrThrow(groupId, currentUserId);

    return this.prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(groupId: bigint, targetUserId: bigint, dto: UpdateMemberRoleDto, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    const targetMember = await this.requireActiveTargetMemberOrThrow(groupId, targetUserId);

    if (targetMember.role === GroupRole.ADMIN && dto.role !== GroupRole.ADMIN) {
      await this.requireNotLastAdminOrThrow(groupId);
    }

    return this.prisma.groupMember.update({
      where: { userId_groupId: { userId: targetUserId, groupId } },
      data: { role: dto.role },
    });
  }

  async removeMember(groupId: bigint, targetUserId: bigint, currentUserId: bigint): Promise<void> {
    await this.findGroupOrThrow(groupId);

    if (targetUserId === currentUserId) {
      await this.requireActiveMemberOrThrow(groupId, currentUserId);
    } else {
      await this.requireAdminOrThrow(groupId, currentUserId);
    }

    const targetMember = await this.requireActiveTargetMemberOrThrow(groupId, targetUserId);

    if (targetMember.role === GroupRole.ADMIN) {
      await this.requireNotLastAdminOrThrow(groupId);
    }

    await this.prisma.$transaction([
      this.prisma.groupMember.update({
        where: { userId_groupId: { userId: targetUserId, groupId } },
        data: { leftAt: new Date() },
      }),
      this.prisma.group.update({
        where: { id: groupId },
        data: { currentMembers: { decrement: 1 } },
      }),
    ]);
  }

  private async requireActiveTargetMemberOrThrow(groupId: bigint, targetUserId: bigint) {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_TARGET_MEMBER_NOT_FOUND);
    }

    return member;
  }

  private async requireNotLastAdminOrThrow(groupId: bigint) {
    const adminCount = await this.prisma.groupMember.count({
      where: { groupId, role: GroupRole.ADMIN, leftAt: null },
    });

    if (adminCount <= 1) {
      throw new BusinessException(ErrorCode.GROUP_LAST_ADMIN);
    }
  }

  private async findGroupOrThrow(groupId: bigint) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });

    if (!group || group.isDeleted) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    return group;
  }

  private async requireAdminOrThrow(groupId: bigint, userId: bigint) {
    const member = await this.requireActiveMemberOrThrow(groupId, userId);

    if (member.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.GROUP_FORBIDDEN);
    }

    return member;
  }

  private async requireActiveMemberOrThrow(groupId: bigint, userId: bigint) {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    return member;
  }
}
