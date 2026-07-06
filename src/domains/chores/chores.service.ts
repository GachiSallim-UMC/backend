import { Injectable } from '@nestjs/common';
import { ChoreStatus, GroupRole, Prisma, RepeatType } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChoreDto } from './dto/create-chore.dto';
import { ListChoresQueryDto } from './dto/list-chores-query.dto';
import { UpdateChoreDto } from './dto/update-chore.dto';

const USER_SELECT = { id: true, nickname: true } satisfies Prisma.UserSelect;

const CHORE_WITH_USERS = {
  assignee: { select: USER_SELECT },
  completer: { select: USER_SELECT },
  creator: { select: USER_SELECT },
} satisfies Prisma.ChoreInclude;

type ChoreWithUsers = Prisma.ChoreGetPayload<{ include: typeof CHORE_WITH_USERS }>;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoNoMillis(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function mapUser(user: { id: bigint; nickname: string }) {
  return { userId: Number(user.id), nickname: user.nickname };
}

function addInterval(date: Date, repeatType: RepeatType): Date {
  const next = new Date(date);

  switch (repeatType) {
    case RepeatType.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case RepeatType.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case RepeatType.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      break;
  }

  return next;
}

@Injectable()
export class ChoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listChores(query: ListChoresQueryDto) {
    const chores = await this.prisma.chore.findMany({
      where: {
        groupId: BigInt(query.groupId),
        status: query.status,
        assigneeId: query.assigneeId ? BigInt(query.assigneeId) : undefined,
      },
      include: CHORE_WITH_USERS,
      orderBy: { startDate: 'asc' },
    });

    return chores.map((chore) => this.toListItem(chore));
  }

  async createChore(dto: CreateChoreDto, createdBy: bigint) {
    const startDate = new Date(dto.startDate);
    const dueDate = new Date(dto.dueDate);

    this.assertDueDateAfterStart(startDate, dueDate, dto.dueDate);

    await this.assertAssigneeInGroup(
      BigInt(dto.assigneeId),
      BigInt(dto.groupId),
      String(dto.assigneeId),
    );

    const chore = await this.prisma.chore.create({
      data: {
        groupId: BigInt(dto.groupId),
        title: dto.title,
        assigneeId: BigInt(dto.assigneeId),
        startDate,
        dueDate,
        repeatType: dto.repeatType ?? RepeatType.NONE,
        createdBy,
      },
      include: CHORE_WITH_USERS,
    });

    return this.toCreateResponse(chore);
  }

  async updateChore(choreId: bigint, dto: UpdateChoreDto) {
    const existing = await this.findChoreOrThrow(choreId);

    const startDate = new Date(dto.startDate);
    const dueDate = new Date(dto.dueDate);

    this.assertDueDateAfterStart(startDate, dueDate, dto.dueDate);

    await this.assertAssigneeInGroup(
      BigInt(dto.assigneeId),
      existing.groupId,
      String(dto.assigneeId),
    );

    const chore = await this.prisma.chore.update({
      where: { id: choreId },
      data: {
        title: dto.title,
        assigneeId: BigInt(dto.assigneeId),
        startDate,
        dueDate,
        repeatType: dto.repeatType,
      },
      include: CHORE_WITH_USERS,
    });

    return this.toUpdateResponse(chore);
  }

  async completeChore(choreId: bigint, completedBy: bigint) {
    const chore = await this.findChoreOrThrow(choreId);

    if (chore.status === ChoreStatus.DONE) {
      throw new BusinessException(ErrorCode.CHORE_ALREADY_DONE);
    }

    const completedAt = new Date();

    const updated = await this.prisma.chore.update({
      where: { id: choreId },
      data: { status: ChoreStatus.DONE, completedBy, completedAt },
      include: CHORE_WITH_USERS,
    });

    let nextOccurrence: {
      choreId: number;
      parentId: number;
      dueDate: string;
      status: ChoreStatus;
    } | null = null;

    if (updated.repeatType !== RepeatType.NONE && updated.dueDate) {
      const nextStartDate = addInterval(updated.startDate, updated.repeatType);
      const nextDueDate = addInterval(updated.dueDate, updated.repeatType);

      const created = await this.prisma.chore.create({
        data: {
          parentId: updated.id,
          groupId: updated.groupId,
          title: updated.title,
          assigneeId: updated.assigneeId,
          startDate: nextStartDate,
          dueDate: nextDueDate,
          repeatType: updated.repeatType,
          createdBy: updated.createdBy,
        },
      });

      nextOccurrence = {
        choreId: Number(created.id),
        parentId: Number(created.parentId),
        dueDate: toDateOnly(created.dueDate as Date),
        status: created.status,
      };
    }

    return {
      choreId: Number(updated.id),
      status: updated.status,
      completedBy: updated.completer ? mapUser(updated.completer) : null,
      completedAt: updated.completedAt ? toIsoNoMillis(updated.completedAt) : null,
      ...(nextOccurrence ? { nextOccurrence } : {}),
    };
  }

  async deleteChore(choreId: bigint, requesterId: bigint): Promise<{ choreId: number }> {
    const chore = await this.findChoreOrThrow(choreId);

    await this.assertDeletePermission(chore, requesterId);

    await this.prisma.chore.delete({ where: { id: choreId } });

    return { choreId: Number(chore.id) };
  }

  private async assertDeletePermission(chore: ChoreWithUsers, requesterId: bigint): Promise<void> {
    if (chore.createdBy === requesterId) {
      return;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: requesterId, groupId: chore.groupId } },
    });

    if (!membership || membership.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }
  }

  private async assertAssigneeInGroup(
    assigneeId: bigint,
    groupId: bigint,
    rawAssigneeId: string,
  ): Promise<void> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: assigneeId, groupId } },
    });

    if (!membership || membership.leftAt) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'assigneeId', value: rawAssigneeId, reason: '담당자는 해당 그룹의 멤버여야 합니다.' },
      ]);
    }
  }

  private async findChoreOrThrow(choreId: bigint): Promise<ChoreWithUsers> {
    const chore = await this.prisma.chore.findUnique({
      where: { id: choreId },
      include: CHORE_WITH_USERS,
    });

    if (!chore) {
      throw new BusinessException(ErrorCode.CHORE_NOT_FOUND);
    }

    return chore;
  }

  private assertDueDateAfterStart(startDate: Date, dueDate: Date, rawDueDate: string): void {
    if (dueDate < startDate) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'dueDate', value: rawDueDate, reason: '마감일은 시작일 이후여야 합니다.' },
      ]);
    }
  }

  private toListItem(chore: ChoreWithUsers) {
    return {
      choreId: Number(chore.id),
      groupId: Number(chore.groupId),
      parentId: chore.parentId ? Number(chore.parentId) : null,
      title: chore.title,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      status: chore.status,
      completedBy: chore.completer ? mapUser(chore.completer) : null,
      completedAt: chore.completedAt ? toIsoNoMillis(chore.completedAt) : null,
      createdBy: mapUser(chore.creator),
      createdAt: toIsoNoMillis(chore.createdAt),
      updatedAt: toIsoNoMillis(chore.updatedAt),
    };
  }

  private toCreateResponse(chore: ChoreWithUsers) {
    return {
      choreId: Number(chore.id),
      groupId: Number(chore.groupId),
      parentId: chore.parentId ? Number(chore.parentId) : null,
      title: chore.title,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      status: chore.status,
      createdBy: mapUser(chore.creator),
      createdAt: toIsoNoMillis(chore.createdAt),
      updatedAt: toIsoNoMillis(chore.updatedAt),
    };
  }

  private toUpdateResponse(chore: ChoreWithUsers) {
    return {
      choreId: Number(chore.id),
      groupId: Number(chore.groupId),
      parentId: chore.parentId ? Number(chore.parentId) : null,
      title: chore.title,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      status: chore.status,
      updatedAt: toIsoNoMillis(chore.updatedAt),
    };
  }
}
