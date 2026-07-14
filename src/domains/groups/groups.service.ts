import { Injectable } from '@nestjs/common';
import { GroupRole } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

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

  async getGroupDetail(groupId: bigint) {
    return this.findGroupOrThrow(groupId);
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

  private async findGroupOrThrow(groupId: bigint) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });

    if (!group || group.isDeleted) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    return group;
  }

  private async requireAdminOrThrow(groupId: bigint, userId: bigint) {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!member || member.leftAt || member.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.GROUP_FORBIDDEN);
    }

    return member;
  }
}
