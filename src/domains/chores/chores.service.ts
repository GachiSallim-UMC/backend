import { Injectable } from '@nestjs/common';
import { ChoreStatus, GroupRole, MessageType, Prisma, RepeatType, Weekday } from '@prisma/client';
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

const WEEKDAY_BY_UTC_INDEX: readonly Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

/**
 * repeatType이 WEEKLY이고 반복 요일이 지정된 경우, 기준일 다음으로 오는 지정 요일까지의 일수.
 * 그 외에는 기존 주기(일/주/월)를 그대로 사용한다.
 */
function daysUntilNextRepeatDay(date: Date, repeatDays: readonly Weekday[]): number {
  const baseIndex = date.getUTCDay();

  for (let offset = 1; offset <= 7; offset += 1) {
    if (repeatDays.includes(WEEKDAY_BY_UTC_INDEX[(baseIndex + offset) % 7])) {
      return offset;
    }
  }

  return 7;
}

function addInterval(
  date: Date,
  repeatType: RepeatType,
  repeatDays: readonly Weekday[] = [],
): Date {
  const next = new Date(date);

  switch (repeatType) {
    case RepeatType.DAILY:
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case RepeatType.WEEKLY:
      next.setUTCDate(next.getUTCDate() + (repeatDays.length > 0 ? daysUntilNextRepeatDay(date, repeatDays) : 7));
      break;
    case RepeatType.MONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 1);
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
    const repeatType = dto.repeatType ?? RepeatType.NONE;
    const repeatDays = dto.repeatDays ?? [];
    const startDate = new Date(dto.startDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    this.assertRepeatDaysMatchRepeatType(repeatType, repeatDays);

    if (dueDate) {
      this.assertDueDateAfterStart(startDate, dueDate, dto.dueDate as string);
    }

    await this.assertAssigneeInGroup(
      BigInt(dto.assigneeId),
      BigInt(dto.groupId),
      String(dto.assigneeId),
    );

    const chore = await this.prisma.chore.create({
      data: {
        groupId: BigInt(dto.groupId),
        title: dto.title,
        category: dto.category,
        assigneeId: BigInt(dto.assigneeId),
        startDate,
        dueDate,
        repeatType,
        repeatDays,
        memo: dto.memo ?? null,
        createdBy,
      },
      include: CHORE_WITH_USERS,
    });

    return this.toCreateResponse(chore);
  }

  async updateChore(choreId: bigint, dto: UpdateChoreDto) {
    const existing = await this.findChoreOrThrow(choreId);

    const repeatType = dto.repeatType ?? RepeatType.NONE;
    const repeatDays = dto.repeatDays ?? [];
    const startDate = new Date(dto.startDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    this.assertRepeatDaysMatchRepeatType(repeatType, repeatDays);

    if (dueDate) {
      this.assertDueDateAfterStart(startDate, dueDate, dto.dueDate as string);
    }

    await this.assertAssigneeInGroup(
      BigInt(dto.assigneeId),
      existing.groupId,
      String(dto.assigneeId),
    );

    const chore = await this.prisma.chore.update({
      where: { id: choreId },
      data: {
        title: dto.title,
        category: dto.category,
        assigneeId: BigInt(dto.assigneeId),
        startDate,
        dueDate,
        repeatType,
        repeatDays,
        memo: dto.memo ?? null,
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
      startDate: string;
      dueDate: string | null;
      status: ChoreStatus;
    } | null = null;

    if (updated.repeatType !== RepeatType.NONE) {
      const nextStartDate = addInterval(updated.startDate, updated.repeatType, updated.repeatDays);
      const nextDueDate = updated.dueDate
        ? addInterval(updated.dueDate, updated.repeatType, updated.repeatDays)
        : null;

      const created = await this.prisma.chore.create({
        data: {
          parentId: updated.id,
          groupId: updated.groupId,
          title: updated.title,
          category: updated.category,
          assigneeId: updated.assigneeId,
          startDate: nextStartDate,
          dueDate: nextDueDate,
          repeatType: updated.repeatType,
          repeatDays: updated.repeatDays,
          memo: updated.memo,
          createdBy: updated.createdBy,
        },
      });

      nextOccurrence = {
        choreId: Number(created.id),
        parentId: Number(created.parentId),
        startDate: toDateOnly(created.startDate),
        dueDate: created.dueDate ? toDateOnly(created.dueDate) : null,
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

  async shareChore(choreId: bigint, senderId: bigint, chatRoomId: bigint, content?: string) {
    const chore = await this.findChoreOrThrow(choreId);

    const chatRoom = await this.prisma.chatRoom.findUnique({ where: { id: chatRoomId } });

    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    if (chatRoom.groupId !== chore.groupId) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'chatRoomId', value: String(chatRoomId), reason: '집안일과 동일한 그룹의 채팅방만 공유할 수 있습니다.' },
      ]);
    }

    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId: senderId } },
    });

    if (!membership) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_NOT_FOUND);
    }

    const shareCard = {
      title: chore.title,
      assignee: chore.assignee.nickname,
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      status: chore.status,
    };

    const message = await this.prisma.message.create({
      data: {
        chatRoomId,
        senderId,
        type: MessageType.CARD_CHORE,
        content: content ?? '',
        refId: chore.id,
      },
    });

    return {
      choreId: Number(chore.id),
      chatMessageId: Number(message.id),
      shareCard,
      sentAt: toIsoNoMillis(message.createdAt),
    };
  }

  private async assertDeletePermission(chore: ChoreWithUsers, requesterId: bigint): Promise<void> {
    if (chore.createdBy === requesterId) {
      return;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: requesterId, groupId: chore.groupId } },
    });

    if (!membership || membership.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.CHORE_FORBIDDEN);
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

  private assertRepeatDaysMatchRepeatType(
    repeatType: RepeatType,
    repeatDays: readonly Weekday[],
  ): void {
    if (repeatType === RepeatType.WEEKLY && repeatDays.length === 0) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'repeatDays', value: '[]', reason: '매주 반복은 반복 요일을 1개 이상 선택해야 합니다.' },
      ]);
    }

    if (repeatType !== RepeatType.WEEKLY && repeatDays.length > 0) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        {
          field: 'repeatDays',
          value: repeatDays.join(','),
          reason: '반복 요일은 repeatType이 WEEKLY일 때만 사용할 수 있습니다.',
        },
      ]);
    }
  }

  private assertDueDateAfterStart(startDate: Date, dueDate: Date, rawDueDate: string): void {
    if (dueDate < startDate) {
      throw new BusinessException(ErrorCode.CHORE_INVALID_DATE, [
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
      category: chore.category,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      repeatDays: chore.repeatDays,
      memo: chore.memo,
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
      category: chore.category,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      repeatDays: chore.repeatDays,
      memo: chore.memo,
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
      category: chore.category,
      assignee: mapUser(chore.assignee),
      startDate: toDateOnly(chore.startDate),
      dueDate: chore.dueDate ? toDateOnly(chore.dueDate) : null,
      repeatType: chore.repeatType,
      repeatDays: chore.repeatDays,
      memo: chore.memo,
      status: chore.status,
      updatedAt: toIsoNoMillis(chore.updatedAt),
    };
  }
}
