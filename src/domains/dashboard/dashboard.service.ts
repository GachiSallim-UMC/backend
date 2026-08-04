import { Injectable } from '@nestjs/common';
import { ChoreStatus, ExpenseStatus, RepeatType, SupplyStatus } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

const USER_SELECT = {
  id: true,
  nickname: true,
} as const;

const KOREA_TIME_ZONE = 'Asia/Seoul';

type TodayChoreRecord = {
  id: bigint;
  title: string;
  repeatType: RepeatType;
  status: ChoreStatus;
  assignee: {
    nickname: string;
  };
};

interface ActivityLogRecord {
  id: bigint;
  type: string;
  user: { nickname: string; profileImage: string | null };
  description: string | null;
  createdAt: Date;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(authSub: string, groupId: number): Promise<DashboardResponseDto> {
    const userId = await this.resolveActiveUserId(authSub);
    const group = await this.verifyGroupMembership(userId, BigInt(groupId));

    const [todayStart, tomorrowStart] = getTodayKoreaRange();

    const [
      unsettledAmountResult,
      unsettledExpenseCount,
      todayChoreCount,
      unfinishedChoreCount,
      todayChores,
      lowSupplyCount,
      unreadMessageCount,
      recentActivities,
      unsettledExpenses,
      lowSupplies,
    ] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { groupId: group.id, status: { not: ExpenseStatus.DONE } },
        _sum: { totalAmount: true },
      }),
      this.prisma.expense.count({
        where: { groupId: group.id, status: { not: ExpenseStatus.DONE } },
      }),
      this.prisma.chore.count({
        where: {
          groupId: group.id,
          startDate: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.chore.count({
        where: {
          groupId: group.id,
          startDate: { gte: todayStart, lt: tomorrowStart },
          status: ChoreStatus.PENDING,
        },
      }),
      this.prisma.chore.findMany({
        where: {
          groupId: group.id,
          startDate: { gte: todayStart, lt: tomorrowStart },
        },
        include: { assignee: { select: USER_SELECT } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
      this.prisma.supply.count({
        where: { groupId: group.id, status: { in: [SupplyStatus.LOW, SupplyStatus.EMPTY] } },
      }),
      this.getUnreadMessageCount(userId, group.id),
      this.prisma.activityLog.findMany({
        where: { groupId: group.id },
        include: { user: { select: { nickname: true, profileImage: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: { groupId: group.id, status: { not: ExpenseStatus.DONE } },
        include: {
          payer: { select: USER_SELECT },
          splits: { select: { amount: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
      this.prisma.supply.findMany({
        where: { groupId: group.id, status: { in: [SupplyStatus.LOW, SupplyStatus.EMPTY] } },
        include: { assignee: { select: USER_SELECT } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ]);

    return {
      summary: {
        todayChoreCount,
        unfinishedChoreCount,
        unsettledAmount: unsettledAmountResult._sum.totalAmount ?? 0,
        unsettledExpenseCount,
        lowSupplyCount,
        unreadMessageCount,
      },
      todayChores: todayChores.map(toTodayChoreResponse),
      unsettledExpenses: unsettledExpenses.map((expense) => ({
        expenseId: Number(expense.id),
        title: expense.title,
        payerName: expense.payer.nickname,
        amountPerPerson: this.calculateAmountPerPerson(
          expense.totalAmount,
          expense.splits.length,
          expense.splits,
        ),
        status: expense.status === ExpenseStatus.DONE ? 'SETTLED' : 'UNSETTLED',
      })),
      lowSupplies: lowSupplies.map((supply) => ({
        supplyId: Number(supply.id),
        name: supply.name,
        status: supply.status === SupplyStatus.EMPTY ? 'EMPTY' : 'LOW',
        assigneeName: supply.assignee?.nickname ?? null,
      })),
      recentActivities: recentActivities.map((activity) => {
        const message = this.getActivityMessage(activity);
        return {
          activityId: Number(activity.id),
          actorName: activity.user.nickname,
          actorProfileImage: activity.user.profileImage,
          message,
          detail: activity.description ?? message,
          createdAt: activity.createdAt.toISOString(),
        };
      }),
    };
  }

  private async resolveActiveUserId(authSub: string): Promise<bigint> {
    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub: authSub },
      select: { user: { select: { id: true, isActive: true } } },
    });

    if (!identity) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    }

    if (!identity.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    return identity.user.id;
  }

  private async verifyGroupMembership(userId: bigint, groupId: bigint): Promise<{ id: bigint }> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId, isDeleted: false },
      select: {
        id: true,
        members: {
          where: { userId, leftAt: null },
          select: { id: true },
        },
      },
    });

    if (!group) {
      throw new BusinessException(ErrorCode.GROUP_NOT_FOUND);
    }

    if (group.members.length === 0) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    return { id: group.id };
  }

  private async getUnreadMessageCount(userId: bigint, groupId: bigint): Promise<number> {
    const memberships = await this.prisma.chatRoomMember.findMany({
      where: { userId, chatRoom: { groupId } },
      select: { chatRoomId: true, lastReadAt: true },
    });

    if (memberships.length === 0) {
      return 0;
    }

    const unreadPerRoom = await Promise.all(
      memberships.map((membership) =>
        this.prisma.message.count({
          where: {
            chatRoomId: membership.chatRoomId,
            senderId: { not: userId },
            createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          },
        }),
      ),
    );

    return unreadPerRoom.reduce((sum, unreadCount) => sum + unreadCount, 0);
  }

  private calculateAmountPerPerson(
    totalAmount: number,
    participantCount: number,
    splits: Array<{ amount: number }>,
  ): number {
    if (participantCount <= 0) {
      return 0;
    }

    const splitAmountSum = splits.reduce((sum, split) => sum + split.amount, 0);
    if (splitAmountSum <= 0) {
      return Math.ceil(totalAmount / participantCount);
    }

    return Math.ceil(splitAmountSum / participantCount);
  }

  private getActivityMessage(activity: ActivityLogRecord): string {
    const userName = activity.user.nickname;
    switch (activity.type) {
      case 'CHORE_CREATED':
        return `${userName} 님이 집안일을 등록했습니다.`;
      case 'CHORE_DONE':
        return `${userName} 님이 집안일을 완료 처리했습니다.`;
      case 'EXPENSE_CREATED':
        return `${userName} 님이 생활비를 등록했습니다.`;
      case 'EXPENSE_DONE':
        return `${userName} 님이 정산을 완료했습니다.`;
      case 'SUPPLY_CHANGED':
        return `${userName} 님이 비품 상태를 변경했습니다.`;
      case 'RULE_CREATED':
        return `${userName} 님이 규칙을 등록했습니다.`;
      case 'RULE_EDITED':
        return `${userName} 님이 규칙을 수정했습니다.`;
      case 'MEMBER_JOINED':
        return `${userName} 님이 그룹에 참여했습니다.`;
      default:
        return `${userName} 님이 활동을 남겼습니다.`;
    }
  }
}

function toTodayChoreResponse(chore: TodayChoreRecord) {
  return {
    choreId: Number(chore.id),
    title: chore.title,
    assigneeName: chore.assignee.nickname,
    repeatText: toRepeatText(chore.repeatType),
    status: chore.status,
  };
}

function toRepeatText(repeatType: RepeatType): string {
  switch (repeatType) {
    case RepeatType.DAILY:
      return 'Daily repeat';
    case RepeatType.WEEKLY:
      return 'Weekly repeat';
    case RepeatType.MONTHLY:
      return 'Monthly repeat';
    default:
      return 'No repeat';
  }
}

function getTodayKoreaRange(): [Date, Date] {
  const formattedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = formattedDate.split('-').map(Number);

  const todayStart = new Date(Date.UTC(year, month - 1, day, -9));
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  return [todayStart, tomorrowStart];
}

