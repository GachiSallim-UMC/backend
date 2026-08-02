import { Injectable } from '@nestjs/common';
import { GroupRole, Prisma } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { generateInviteCode } from '../../common/utils/invite-code.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupPermissionDto } from './dto/update-group-permission.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WRITE_CONFLICT_ERROR_CODE = 'P2034';
const MAX_SERIALIZABLE_RETRIES = 3;
const INVITE_CODE_GENERATION_ATTEMPTS = 5;

const GROUP_MEMBER_SELECT = {
  userId: true,
  groupId: true,
  role: true,
  joinedAt: true,
  leftAt: true,
  user: {
    select: {
      id: true,
      name: true,
      nickname: true,
      profileImage: true,
    },
  },
} satisfies Prisma.GroupMemberSelect;

type PrismaTransactionClient = Prisma.TransactionClient;

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
    for (let attempt = 0; attempt < INVITE_CODE_GENERATION_ATTEMPTS; attempt++) {
      const candidate = generateInviteCode();

      try {
        return await this.prisma.group.create({
          data: {
            name: dto.name,
            description: dto.description,
            maxMembers: dto.maxMembers,
            residenceType: dto.residenceType,
            inviteCode: candidate,
            inviteExpiredAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
            createdBy,
            members: {
              create: { userId: createdBy, role: GroupRole.ADMIN },
            },
            permission: {
              create: {},
            },
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }

        throw error;
      }
    }

    throw new BusinessException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR);
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
        ...(dto.groupImage !== undefined ? { groupImage: dto.groupImage } : {}),
        ...(dto.maxMembers !== undefined ? { maxMembers: dto.maxMembers } : {}),
      },
    });
  }

  async getGroupPermission(groupId: bigint, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireActiveMemberOrThrow(groupId, currentUserId);

    // Self-heals groups created without a permission row (e.g. by a rolled-back
    // pre-permission release) instead of throwing P2025.
    return this.prisma.groupPermission.upsert({
      where: { groupId },
      create: { groupId },
      update: {},
    });
  }

  async updateGroupPermission(groupId: bigint, dto: UpdateGroupPermissionDto, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    const data = {
      ...(dto.allowChoreRegistration !== undefined ? { allowChoreRegistration: dto.allowChoreRegistration } : {}),
      ...(dto.allowSettlementRegistration !== undefined
        ? { allowSettlementRegistration: dto.allowSettlementRegistration }
        : {}),
      ...(dto.allowItemStatusChange !== undefined ? { allowItemStatusChange: dto.allowItemStatusChange } : {}),
      ...(dto.autoApproveNewMembers !== undefined ? { autoApproveNewMembers: dto.autoApproveNewMembers } : {}),
    };

    return this.prisma.groupPermission.upsert({
      where: { groupId },
      create: { groupId, ...data },
      update: data,
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
      select: GROUP_MEMBER_SELECT,
    });
  }

  async updateMemberRole(groupId: bigint, targetUserId: bigint, dto: UpdateMemberRoleDto, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    return this.runSerializable(async (tx) => {
      const targetMember = await this.requireActiveTargetMemberOrThrow(groupId, targetUserId, tx);

      if (targetMember.role === GroupRole.ADMIN && dto.role !== GroupRole.ADMIN) {
        await this.requireNotLastAdminOrThrow(groupId, tx);
      }

      return tx.groupMember.update({
        where: { userId_groupId: { userId: targetUserId, groupId } },
        data: { role: dto.role },
      });
    });
  }

  async removeMember(groupId: bigint, targetUserId: bigint, currentUserId: bigint): Promise<void> {
    await this.findGroupOrThrow(groupId);

    if (targetUserId === currentUserId) {
      await this.requireActiveMemberOrThrow(groupId, currentUserId);
    } else {
      await this.requireAdminOrThrow(groupId, currentUserId);
    }

    await this.runSerializable(async (tx) => {
      const targetMember = await this.requireActiveTargetMemberOrThrow(groupId, targetUserId, tx);

      if (targetMember.role === GroupRole.ADMIN) {
        await this.requireNotLastAdminOrThrow(groupId, tx);
      }

      const { count } = await tx.groupMember.updateMany({
        where: { userId: targetUserId, groupId, leftAt: null },
        data: { leftAt: new Date() },
      });

      if (count === 1) {
        await tx.group.update({
          where: { id: groupId },
          data: { currentMembers: { decrement: 1 } },
        });
      }
    });
  }

  private async runSerializable<T>(fn: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const isWriteConflict =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === WRITE_CONFLICT_ERROR_CODE;

        if (!isWriteConflict || attempt === MAX_SERIALIZABLE_RETRIES) {
          throw error;
        }
      }
    }

    throw new Error('unreachable');
  }

  private async requireActiveTargetMemberOrThrow(
    groupId: bigint,
    targetUserId: bigint,
    client: PrismaTransactionClient | PrismaService,
  ) {
    const member = await client.groupMember.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_TARGET_MEMBER_NOT_FOUND);
    }

    return member;
  }

  private async requireNotLastAdminOrThrow(groupId: bigint, client: PrismaTransactionClient | PrismaService) {
    const adminCount = await client.groupMember.count({
      where: { groupId, role: GroupRole.ADMIN, leftAt: null },
    });

    if (adminCount <= 1) {
      throw new BusinessException(ErrorCode.GROUP_LAST_ADMIN);
    }
  }

  async reissueInviteCode(groupId: bigint, currentUserId: bigint) {
    await this.findGroupOrThrow(groupId);
    await this.requireAdminOrThrow(groupId, currentUserId);

    return this.updateGroupInviteCode(groupId);
  }

  async getInviteInfo(inviteCode: string) {
    const group = await this.findGroupByValidInviteCodeOrThrow(inviteCode);

    return {
      name: group.name,
      description: group.description,
      groupImage: group.groupImage,
      residenceType: group.residenceType,
      currentMembers: group.currentMembers,
      maxMembers: group.maxMembers,
    };
  }

  async joinGroup(dto: JoinGroupDto, currentUserId: bigint) {
    const group = await this.findGroupByValidInviteCodeOrThrow(dto.inviteCode);

    const existingMember = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: currentUserId, groupId: group.id } },
    });

    if (existingMember && !existingMember.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_ALREADY_MEMBER);
    }

    return this.prisma.$transaction(async (tx) => {
      let updatedGroup;

      try {
        updatedGroup = await tx.group.update({
          where: { id: group.id, currentMembers: { lt: group.maxMembers } },
          data: { currentMembers: { increment: 1 } },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new BusinessException(ErrorCode.GROUP_FULL);
        }

        throw error;
      }

      await (existingMember
        ? tx.groupMember.update({
            where: { userId_groupId: { userId: currentUserId, groupId: group.id } },
            data: { role: GroupRole.MEMBER, joinedAt: new Date(), leftAt: null },
          })
        : tx.groupMember.create({
            data: { userId: currentUserId, groupId: group.id, role: GroupRole.MEMBER },
          }));

      return updatedGroup;
    });
  }

  private async updateGroupInviteCode(groupId: bigint) {
    for (let attempt = 0; attempt < INVITE_CODE_GENERATION_ATTEMPTS; attempt++) {
      const candidate = generateInviteCode();

      try {
        return await this.prisma.group.update({
          where: { id: groupId },
          data: {
            inviteCode: candidate,
            inviteExpiredAt: new Date(Date.now() + INVITE_CODE_TTL_MS),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }

        throw error;
      }
    }

    throw new BusinessException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR);
  }

  private async findGroupOrThrow(groupId: bigint) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });

    if (!group || group.isDeleted) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    return group;
  }

  private async findGroupByValidInviteCodeOrThrow(inviteCode: string) {
    const group = await this.prisma.group.findUnique({ where: { inviteCode } });

    if (!group || group.isDeleted) {
      throw new BusinessException(ErrorCode.GROUP_INVITE_CODE_INVALID);
    }

    if (group.inviteExpiredAt.getTime() < Date.now()) {
      throw new BusinessException(ErrorCode.GROUP_INVITE_CODE_EXPIRED);
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
