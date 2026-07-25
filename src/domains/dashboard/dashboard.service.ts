import { Injectable } from '@nestjs/common';
import { ChoreStatus, ExpenseStatus, RepeatType, SupplyStatus } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(authSub: string, groupId: number): Promise<DashboardResponseDto> {
    const userId = await this.resolveActiveUserId(authSub);
    const group = await this.verifyGroupMembership(userId, BigInt(groupId));

    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    const [
      unsettledAmountResult,
      unsettledExpenseCount,
      todayChores,
      lowSupplyCount,
      unreadMessageCount,
      recentActivities,
      unsettledExpenses,
      lowSupplies,
      unfinishedChoreCount,
    ] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { groupId: group.id, status: { not: ExpenseStatus.DONE } },
        _sum: { totalAmount: true },
      }),
      this.prisma.expense.count({
        where: { groupId: group.id, status: { not: ExpenseStatus.DONE } },
      }),
      this.prisma.chore.findMany({
        where: {
          groupId: group.id,
          status: ChoreStatus.PENDING,
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
        include: { assignee: { select: USER_SELECT } },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
      this.prisma.supply.count({
        where: { groupId: group.id, status: { in: [SupplyStatus.LOW, SupplyStatus.EMPTY] } },
      }),
      this.getUnreadMessageCount(userId, group.id),
      this.prisma.activityLog.findMany({
        where: { groupId: group.id },
        include: { user: { select: { nickname: true } } },
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
        take: 5,
      }),
      this.prisma.supply.findMany({
        where: { groupId: group.id, status: { in: [SupplyStatus.LOW, SupplyStatus.EMPTY] } },
        include: { assignee: { select: USER_SELECT } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.chore.count({
        where: { groupId: group.id, status: ChoreStatus.PENDING },
      }),
    ]);

    return {
      summary: {
        todayChoreCount: todayChores.length,
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
        amountPerPerson: this.calculateAmountPerPerson(expense.totalAmount, expense.splits.length),
        status: expense.status === ExpenseStatus.DONE ? 'SETTLED' : 'UNSETTLED',
      })),
      lowSupplies: lowSupplies.map((supply) => ({
        supplyId: Number(supply.id),
        name: supply.name,
        status: supply.status,
        assigneeName: supply.assignee?.nickname ?? null,
      })),
      recentActivities: recentActivities.map((activity) => {
        const message = activity.description ?? this.getActivityMessage(activity);
        return {
          activityId: Number(activity.id),
          message,
          detail: activity.description ? activity.description : `${message}`,
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

  private calculateAmountPerPerson(totalAmount: number, participantCount: number): number {
    if (participantCount <= 0) {
      return 0;
    }

    return Math.ceil(totalAmount / participantCount);
  }

  private getActivityMessage(activity: ActivityLogRecord): string {
    const userName = activity.user.nickname;
    switch (activity.type) {
      case 'CHORE_CREATED':
        return `${userName} added a new chore.`;
      case 'CHORE_DONE':
        return `${userName} completed a chore.`;
      case 'EXPENSE_CREATED':
        return `${userName} created an expense.`;
      case 'EXPENSE_DONE':
        return `${userName} settled an expense.`;
      case 'SUPPLY_CHANGED':
        return `${userName} updated a supply status.`;
      case 'RULE_CREATED':
        return `${userName} created a household rule.`;
      case 'RULE_EDITED':
        return `${userName} edited a household rule.`;
      case 'MEMBER_JOINED':
        return `${userName} joined the group.`;
      default:
        return `${userName}'s group activity is recorded.`;
    }
  }
}

const USER_SELECT = {
  id: true,
  nickname: true,
} as const;

type TodayChoreRecord = {
  id: bigint;
  title: string;
  repeatType: RepeatType;
  status: string;
  assignee: {
    nickname: string;
  };
};

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

interface ActivityLogRecord {
  id: bigint;
  type: string;
  user: { nickname: string };
  description: string | null;
  createdAt: Date;
}

