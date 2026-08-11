import { Injectable } from '@nestjs/common';
import {
  ChoreStatus,
  CustomOption,
  GroupRole,
  MessageType,
  Prisma,
  RepeatType,
  Weekday,
} from '@prisma/client';
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

const OCCURRENCE_GENERATION_SELECT = {
  id: true,
  parentId: true,
  groupId: true,
  title: true,
  category: true,
  assigneeId: true,
  startDate: true,
  dueDate: true,
  repeatType: true,
  customOption: true,
  repeatInterval: true,
  repeatDays: true,
  memo: true,
  createdBy: true,
} satisfies Prisma.ChoreSelect;

type OccurrenceGenerationSeed = Prisma.ChoreGetPayload<{ select: typeof OCCURRENCE_GENERATION_SELECT }>;

/** 무한/장기 미방문 반복 시리즈가 한 번의 조회로 과도하게 많은 회차를 만들지 않도록 두는 상한. */
const MAX_FUTURE_OCCURRENCE_STEPS = 500;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 서비스 기준 시간대. DASH 도메인(dashboard.service.ts)과 동일한 값을 사용한다. */
const KOREA_TIME_ZONE = 'Asia/Seoul';

const KOREA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 실제 시각(instant)을 한국 달력 날짜의 UTC 자정으로 변환한다.
 * startDate/dueDate는 날짜만 의미하는 값이라 UTC 자정으로 저장되므로,
 * 완료 시각에서 다음 회차를 계산할 때 같은 표현으로 맞춰 준다.
 * 예) 2026-07-28T15:30:00Z(= KST 07-29 00:30) -> 2026-07-29T00:00:00Z
 */
function toKoreaDateOnly(instant: Date): Date {
  const [year, month, day] = KOREA_DATE_FORMATTER.format(instant).split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day));
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

/** 반복 주기 계산에 필요한 설정. Chore 레코드와 DTO 양쪽에서 만들 수 있다. */
export interface RepeatConfig {
  repeatType: RepeatType;
  customOption: CustomOption | null;
  repeatInterval: number | null;
  repeatDays: readonly Weekday[];
}

/**
 * 기준일 다음으로 오는 지정 요일까지의 일수.
 * 요일 지정이 없으면 7일(다음 주 같은 요일)을 반환한다.
 */
function daysUntilNextRepeatDay(date: Date, repeatDays: readonly Weekday[]): number {
  if (repeatDays.length === 0) {
    return 7;
  }

  const baseIndex = date.getUTCDay();

  for (let offset = 1; offset <= 7; offset += 1) {
    if (repeatDays.includes(WEEKDAY_BY_UTC_INDEX[(baseIndex + offset) % 7])) {
      return offset;
    }
  }

  return 7;
}

/**
 * 월 단위 덧셈. 말일 오버플로를 방지하기 위해 해당 월의 마지막 날로 보정한다.
 * 예) 1월 31일 + 1개월 = 3월 3일(X) -> 2월 28일(O), 윤년이면 2월 29일
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const next = new Date(date);

  // 먼저 1일로 옮겨야 setUTCMonth 시 다음 달로 넘치지 않는다.
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);

  const lastDayOfMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();

  next.setUTCDate(Math.min(day, lastDayOfMonth));

  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

/** 다음 반복 회차의 날짜. 반복이 없으면(NONE) 기준일을 그대로 돌려준다. */
function addInterval(date: Date, config: RepeatConfig): Date {
  const { repeatType, customOption, repeatInterval, repeatDays } = config;
  const n = repeatInterval ?? 1;

  switch (repeatType) {
    case RepeatType.DAILY:
      return addDays(date, 1);
    case RepeatType.WEEKLY:
      return addDays(date, daysUntilNextRepeatDay(date, repeatDays));
    case RepeatType.MONTHLY:
      return addMonths(date, 1);
    case RepeatType.CUSTOM:
      switch (customOption) {
        case CustomOption.EVERY_N_DAYS:
          return addDays(date, n);
        case CustomOption.EVERY_N_WEEKS:
          return addDays(date, n * 7);
        case CustomOption.EVERY_N_MONTHS:
          return addMonths(date, n);
        case CustomOption.SPECIFIC_DAYS:
          return addDays(date, daysUntilNextRepeatDay(date, repeatDays));
        default:
          return new Date(date);
      }
    default:
      return new Date(date);
  }
}

@Injectable()
export class ChoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listChores(query: ListChoresQueryDto, requesterId: bigint) {
    await this.requireActiveGroupMemberOrThrow(BigInt(query.groupId), requesterId);

    const dateRange = this.assertAndBuildDateRange(query.fromDate, query.toDate);

    if (dateRange) {
      await this.generateFutureOccurrences(BigInt(query.groupId), dateRange.to);
    }

    const chores = await this.prisma.chore.findMany({
      where: {
        groupId: BigInt(query.groupId),
        status: query.status,
        assigneeId: query.assigneeId ? BigInt(query.assigneeId) : undefined,
        ...(dateRange ? { OR: this.buildDueDateFilter(dateRange) } : {}),
      },
      include: CHORE_WITH_USERS,
      orderBy: { startDate: 'asc' },
    });

    return chores.map((chore) => this.toListItem(chore));
  }

  /**
   * fromDate/toDate 쿼리를 검증하고 UTC 자정 기준 Date 범위로 변환한다.
   * 둘 다 없으면 필터 미적용(null), 하나만 있거나 역전/7일 초과면 400.
   */
  private assertAndBuildDateRange(
    fromDate?: string,
    toDate?: string,
  ): { from: Date; to: Date } | null {
    if (!fromDate && !toDate) {
      return null;
    }

    if (!fromDate || !toDate) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        {
          field: !fromDate ? 'fromDate' : 'toDate',
          value: null,
          reason: 'fromDate와 toDate는 함께 전달해야 합니다.',
        },
      ]);
    }

    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);

    if (from > to) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'fromDate', value: fromDate, reason: 'fromDate는 toDate보다 이후일 수 없습니다.' },
      ]);
    }

    const rangeDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (rangeDays > 7) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'toDate', value: toDate, reason: '주간 조회는 최대 7일 범위까지만 허용됩니다.' },
      ]);
    }

    return { from, to };
  }

  /**
   * 조회 기준일 규칙: 일회성(repeatType=NONE)은 dueDate ?? startDate,
   * 반복 집안일은 각 회차의 startDate를 기준으로 범위 필터링한다.
   */
  private buildDueDateFilter(range: { from: Date; to: Date }): Prisma.ChoreWhereInput[] {
    const inRange = { gte: range.from, lte: range.to };

    return [
      { repeatType: RepeatType.NONE, dueDate: null, startDate: inRange },
      { repeatType: RepeatType.NONE, dueDate: inRange },
      { repeatType: { not: RepeatType.NONE }, startDate: inRange },
    ];
  }

  /**
   * 조회 범위(until)까지 아직 존재하지 않는 반복 집안일의 미래 회차를 실제 레코드로 생성한다.
   * 시리즈의 '꼬리'(다른 회차의 parentId로 참조되지 않는 회차)부터 addInterval로 한 칸씩 전진하며,
   * until을 넘거나 dueDate(반복 종료일)를 넘으면 멈춘다. 무한 반복 시리즈가 오래 방치된 경우를
   * 대비해 시리즈당 생성 횟수에 상한을 둔다.
   */
  private async generateFutureOccurrences(groupId: bigint, until: Date): Promise<void> {
    const repeating = await this.prisma.chore.findMany({
      where: { groupId, repeatType: { not: RepeatType.NONE } },
      select: OCCURRENCE_GENERATION_SELECT,
    });

    const referencedParentIds = new Set(
      repeating.filter((chore) => chore.parentId !== null).map((chore) => chore.parentId!.toString()),
    );
    const tails = repeating.filter((chore) => !referencedParentIds.has(chore.id.toString()));

    for (const tail of tails) {
      await this.generateOccurrencesFrom(tail, until);
    }
  }

  private async generateOccurrencesFrom(
    tail: OccurrenceGenerationSeed,
    until: Date,
  ): Promise<void> {
    let current = tail;

    for (let step = 0; step < MAX_FUTURE_OCCURRENCE_STEPS; step += 1) {
      const nextStartDate = addInterval(current.startDate, {
        repeatType: current.repeatType,
        customOption: current.customOption,
        repeatInterval: current.repeatInterval,
        repeatDays: current.repeatDays,
      });

      if (nextStartDate > until) {
        return;
      }

      if (current.dueDate !== null && nextStartDate > current.dueDate) {
        return;
      }

      const existing = await this.prisma.chore.findFirst({
        where: { parentId: current.id, startDate: nextStartDate },
        select: OCCURRENCE_GENERATION_SELECT,
      });

      current =
        existing ??
        (await this.prisma.chore.create({
          data: {
            parentId: current.id,
            groupId: current.groupId,
            title: current.title,
            category: current.category,
            assigneeId: current.assigneeId,
            startDate: nextStartDate,
            dueDate: current.dueDate,
            repeatType: current.repeatType,
            customOption: current.customOption,
            repeatInterval: current.repeatInterval,
            repeatDays: current.repeatDays,
            memo: current.memo,
            createdBy: current.createdBy,
          },
          select: OCCURRENCE_GENERATION_SELECT,
        }));
    }
  }

  async createChore(dto: CreateChoreDto, createdBy: bigint) {
    await this.requireActiveGroupMemberOrThrow(BigInt(dto.groupId), createdBy);

    const repeat = this.toRepeatConfig(dto);
    const startDate = new Date(dto.startDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    this.assertRepeatConfig(repeat);

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
        repeatType: repeat.repeatType,
        customOption: repeat.customOption,
        repeatInterval: repeat.repeatInterval,
        repeatDays: [...repeat.repeatDays],
        memo: dto.memo ?? null,
        createdBy,
      },
      include: CHORE_WITH_USERS,
    });

    return this.toCreateResponse(chore);
  }

  async updateChore(choreId: bigint, dto: UpdateChoreDto, requesterId: bigint) {
    const existing = await this.findChoreOrThrow(choreId);

    await this.requireActiveGroupMemberOrThrow(existing.groupId, requesterId);

    const repeat = this.toRepeatConfig(dto);
    const startDate = new Date(dto.startDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    this.assertRepeatConfig(repeat);

    if (dueDate) {
      this.assertDueDateAfterStart(startDate, dueDate, dto.dueDate as string);
    }

    await this.assertAssigneeInGroup(
      BigInt(dto.assigneeId),
      existing.groupId,
      String(dto.assigneeId),
    );

    const descendantIds = await this.collectFutureOccurrenceIds(choreId);

    // 회차별 처리 기준: 수정은 선택 회차 + 이후 미래 회차(이미 생성된 자식 체인)에 공통 적용.
    // 각 회차 고유의 startDate는 유지하고, 선택 회차만 요청받은 startDate로 갱신한다.
    const sharedFields = {
      title: dto.title,
      category: dto.category,
      assigneeId: BigInt(dto.assigneeId),
      dueDate,
      repeatType: repeat.repeatType,
      customOption: repeat.customOption,
      repeatInterval: repeat.repeatInterval,
      repeatDays: [...repeat.repeatDays],
      memo: dto.memo ?? null,
    };

    const chore = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.chore.update({
        where: { id: choreId },
        data: { ...sharedFields, startDate },
        include: CHORE_WITH_USERS,
      });

      if (descendantIds.length > 0) {
        await tx.chore.updateMany({
          where: { id: { in: descendantIds } },
          data: sharedFields,
        });
      }

      return updated;
    });

    return this.toUpdateResponse(chore);
  }

  /**
   * choreId 이후로 이미 생성된 미래 회차 id들을 자식 체인을 따라 전부 수집한다.
   * 부모(과거) 방향으로는 올라가지 않으므로 지나간/완료된 이전 회차는 포함되지 않는다.
   */
  private async collectFutureOccurrenceIds(choreId: bigint): Promise<bigint[]> {
    const ids: bigint[] = [];
    let frontier = [choreId];

    while (frontier.length > 0) {
      const children = await this.prisma.chore.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });

      if (children.length === 0) {
        break;
      }

      const childIds = children.map((child) => child.id);
      ids.push(...childIds);
      frontier = childIds;
    }

    return ids;
  }

  async completeChore(choreId: bigint, completedBy: bigint) {
    const chore = await this.findChoreOrThrow(choreId);

    await this.requireActiveGroupMemberOrThrow(chore.groupId, completedBy);

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
      // 다음 회차는 '완료일' 기준으로 계산한다. startDate를 기준으로 삼으면
      // 완료가 밀렸을 때 다음 회차가 오늘이나 과거 날짜로 생성된다. (#159)
      // 단, 시작일보다 먼저 완료한 경우에는 시작일을 기준으로 삼아 회차가 겹치지 않게 한다.
      const completedDate = toKoreaDateOnly(completedAt);
      const baseDate = completedDate > updated.startDate ? completedDate : updated.startDate;

      const nextStartDate = addInterval(baseDate, {
        repeatType: updated.repeatType,
        customOption: updated.customOption,
        repeatInterval: updated.repeatInterval,
        repeatDays: updated.repeatDays,
      });

      // dueDate는 '반복 종료일'이다. 회차마다 밀지 않고 고정하며,
      // 다음 회차 시작일이 종료일을 넘어서면 반복을 종료한다. (같은 날은 생성)
      const reachedRepeatEnd = updated.dueDate !== null && nextStartDate > updated.dueDate;

      if (!reachedRepeatEnd) {
        const created = await this.prisma.chore.create({
          data: {
            parentId: updated.id,
            groupId: updated.groupId,
            title: updated.title,
            category: updated.category,
            assigneeId: updated.assigneeId,
            startDate: nextStartDate,
            dueDate: updated.dueDate,
            repeatType: updated.repeatType,
            customOption: updated.customOption,
            repeatInterval: updated.repeatInterval,
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
    }

    return {
      choreId: Number(updated.id),
      status: updated.status,
      completedBy: updated.completer ? mapUser(updated.completer) : null,
      completedAt: updated.completedAt ? toIsoNoMillis(updated.completedAt) : null,
      ...(nextOccurrence ? { nextOccurrence } : {}),
    };
  }

  /**
   * 완료 취소(미완료 전환). (#159)
   * 완료 처리 때 자동 생성된 다음 회차를 함께 제거해야
   * 완료 -> 취소 -> 재완료 시 회차가 중복 생성되지 않는다.
   */
  async incompleteChore(choreId: bigint, requesterId: bigint) {
    const chore = await this.findChoreOrThrow(choreId);

    await this.requireActiveGroupMemberOrThrow(chore.groupId, requesterId);

    if (chore.status !== ChoreStatus.DONE) {
      throw new BusinessException(ErrorCode.CHORE_NOT_DONE);
    }

    const children = await this.prisma.chore.findMany({
      where: { parentId: choreId },
      select: { id: true, status: true },
    });

    // 다음 회차가 이미 완료됐다면 그 아래로 회차가 더 이어졌을 수 있어 되돌리지 않는다.
    if (children.some((child) => child.status === ChoreStatus.DONE)) {
      throw new BusinessException(ErrorCode.CHORE_NEXT_OCCURRENCE_DONE);
    }

    const removedChildIds = children.map((child) => child.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removedChildIds.length > 0) {
        await tx.chore.deleteMany({ where: { id: { in: removedChildIds } } });
      }

      return tx.chore.update({
        where: { id: choreId },
        data: { status: ChoreStatus.PENDING, completedBy: null, completedAt: null },
        include: CHORE_WITH_USERS,
      });
    });

    return {
      choreId: Number(updated.id),
      status: updated.status,
      completedBy: null,
      completedAt: null,
      removedNextOccurrenceIds: removedChildIds.map(Number),
    };
  }

  async deleteChore(
    choreId: bigint,
    requesterId: bigint,
  ): Promise<{ choreId: number; deletedChoreIds: number[] }> {
    const chore = await this.findChoreOrThrow(choreId);

    await this.requireActiveGroupMemberOrThrow(chore.groupId, requesterId);
    await this.assertDeletePermission(chore, requesterId);

    // 회차별 처리 기준: 삭제는 선택 회차를 포함해 이후 미래 회차를 모두 삭제한다.
    const descendantIds = await this.collectFutureOccurrenceIds(choreId);
    const idsToDelete = [choreId, ...descendantIds];

    await this.prisma.chore.deleteMany({ where: { id: { in: idsToDelete } } });

    return { choreId: Number(chore.id), deletedChoreIds: idsToDelete.map(Number) };
  }

  async shareChore(choreId: bigint, senderId: bigint, chatRoomId: bigint, content?: string) {
    const chore = await this.findChoreOrThrow(choreId);

    await this.requireActiveGroupMemberOrThrow(chore.groupId, senderId);

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

  /**
   * 요청자가 해당 그룹의 활성 멤버인지 확인한다.
   * RULE 도메인의 requireActiveGroupMemberOrThrow와 동일한 규칙을 따른다.
   */
  private async requireActiveGroupMemberOrThrow(groupId: bigint, userId: bigint): Promise<void> {
    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
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

  /** DTO에서 반복 설정을 추출한다. 값이 없는 필드는 null로 정규화한다. */
  private toRepeatConfig(dto: CreateChoreDto | UpdateChoreDto): RepeatConfig {
    return {
      repeatType: dto.repeatType,
      customOption: dto.customOption ?? null,
      repeatInterval: dto.repeatInterval ?? null,
      repeatDays: dto.repeatDays ?? [],
    };
  }

  /**
   * 반복 설정 조합 검증.
   * - WEEKLY / SPECIFIC_DAYS: repeatDays 1개 이상 필수
   * - CUSTOM: customOption 필수, 그 외 유형은 customOption 금지
   * - EVERY_N_*: repeatInterval 필수, 그 외에는 금지
   */
  private assertRepeatConfig(config: RepeatConfig): void {
    const { repeatType, customOption, repeatInterval, repeatDays } = config;

    if (repeatType === RepeatType.CUSTOM && customOption === null) {
      this.throwInvalidRepeat(
        'customOption',
        null,
        '사용자 정의 반복은 customOption이 필요합니다.',
      );
    }

    if (repeatType !== RepeatType.CUSTOM && customOption !== null) {
      this.throwInvalidRepeat(
        'customOption',
        customOption,
        'customOption은 repeatType이 CUSTOM일 때만 사용할 수 있습니다.',
      );
    }

    const needsInterval =
      customOption === CustomOption.EVERY_N_DAYS ||
      customOption === CustomOption.EVERY_N_WEEKS ||
      customOption === CustomOption.EVERY_N_MONTHS;

    if (needsInterval && repeatInterval === null) {
      this.throwInvalidRepeat(
        'repeatInterval',
        null,
        `${customOption}는 반복 주기(repeatInterval)가 필요합니다.`,
      );
    }

    if (!needsInterval && repeatInterval !== null) {
      this.throwInvalidRepeat(
        'repeatInterval',
        repeatInterval,
        '반복 주기는 customOption이 EVERY_N_DAYS/EVERY_N_WEEKS/EVERY_N_MONTHS일 때만 사용할 수 있습니다.',
      );
    }

    const needsDays =
      repeatType === RepeatType.WEEKLY || customOption === CustomOption.SPECIFIC_DAYS;

    if (needsDays && repeatDays.length === 0) {
      this.throwInvalidRepeat(
        'repeatDays',
        '[]',
        '해당 반복 설정은 반복 요일을 1개 이상 선택해야 합니다.',
      );
    }

    if (!needsDays && repeatDays.length > 0) {
      this.throwInvalidRepeat(
        'repeatDays',
        repeatDays.join(','),
        '반복 요일은 repeatType이 WEEKLY이거나 customOption이 SPECIFIC_DAYS일 때만 사용할 수 있습니다.',
      );
    }
  }

  private throwInvalidRepeat(field: string, value: string | number | null, reason: string): never {
    throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
      { field, value: value === null ? null : String(value), reason },
    ]);
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
      customOption: chore.customOption,
      repeatInterval: chore.repeatInterval,
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
      customOption: chore.customOption,
      repeatInterval: chore.repeatInterval,
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
      customOption: chore.customOption,
      repeatInterval: chore.repeatInterval,
      repeatDays: chore.repeatDays,
      memo: chore.memo,
      status: chore.status,
      updatedAt: toIsoNoMillis(chore.updatedAt),
    };
  }
}
