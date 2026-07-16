import { Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  GroupRole,
  MessageType,
  NotificationType,
  Prisma,
  SplitType,
  SupplyStatus,
} from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { ListSuppliesQueryDto } from './dto/list-supplies-query.dto';
import { PurchaseSupplyDto } from './dto/purchase-supply.dto';
import { UpdateSupplyStatusDto } from './dto/update-supply-status.dto';

const USER_SELECT = { id: true, nickname: true } satisfies Prisma.UserSelect;

const SUPPLY_WITH_USERS = {
  assignee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
} satisfies Prisma.SupplyInclude;

type SupplyWithUsers = Prisma.SupplyGetPayload<{ include: typeof SUPPLY_WITH_USERS }>;

function toIsoNoMillis(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function mapUser(user: { id: bigint; nickname: string }) {
  return { userId: Number(user.id), nickname: user.nickname };
}

@Injectable()
export class SuppliesService {
  constructor(private readonly prisma: PrismaService) {}

  async listSupplies(query: ListSuppliesQueryDto) {
    const supplies = await this.prisma.supply.findMany({
      where: {
        groupId: BigInt(query.groupId),
        status: query.status,
      },
      include: SUPPLY_WITH_USERS,
      orderBy: { createdAt: 'desc' },
    });

    return supplies.map((supply) => this.toSupplyResponse(supply));
  }

  async createSupply(dto: CreateSupplyDto, createdBy: bigint) {
    const groupId = BigInt(dto.groupId);

    if (dto.assigneeId !== undefined) {
      await this.assertAssigneeInGroup(BigInt(dto.assigneeId), groupId, String(dto.assigneeId));
    }

    try {
      const supply = await this.prisma.supply.create({
        data: {
          groupId,
          name: dto.name,
          status: dto.status ?? SupplyStatus.SUFFICIENT,
          assigneeId: dto.assigneeId !== undefined ? BigInt(dto.assigneeId) : null,
          createdBy,
        },
        include: SUPPLY_WITH_USERS,
      });

      return this.toSupplyResponse(supply);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // @@unique([groupId, name]) 위반
        throw new BusinessException(ErrorCode.SUP_CONFLICT);
      }

      throw error;
    }
  }

  async updateStatus(supplyId: bigint, dto: UpdateSupplyStatusDto, userId: bigint) {
    if (dto.status === SupplyStatus.PURCHASED) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        {
          field: 'status',
          value: SupplyStatus.PURCHASED,
          reason: '구매 완료(PURCHASED)는 구매 완료 API(/purchase)에서만 처리할 수 있습니다.',
        },
      ]);
    }

    const supply = await this.findSupplyOrThrow(supplyId);
    const prevStatus = supply.status;
    const nextStatus = dto.status;
    const note = dto.note ?? null;
    // LOW/EMPTY로의 "전환" 시에만 알림 (동일 상태 재지정은 제외)
    const shouldNotify =
      (nextStatus === SupplyStatus.LOW || nextStatus === SupplyStatus.EMPTY) &&
      prevStatus !== nextStatus;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.supplyLog.create({
        data: { supplyId, userId, prevStatus, nextStatus, note },
      });

      const updated = await tx.supply.update({
        where: { id: supplyId },
        data: { status: nextStatus },
      });

      let notificationSent = false;
      if (shouldNotify) {
        const count = await this.createLowStockNotifications(tx, supply, nextStatus);
        notificationSent = count > 0;
      }

      return { updated, notificationSent };
    });

    return {
      supplyId: Number(result.updated.id),
      status: result.updated.status,
      notificationSent: result.notificationSent,
      log: { prevStatus, nextStatus, note },
      updatedAt: toIsoNoMillis(result.updated.updatedAt),
    };
  }

  async purchase(supplyId: bigint, dto: PurchaseSupplyDto, userId: bigint) {
    if (dto.categoryId === undefined) {
      throw new BusinessException(ErrorCode.SUP_INVALID_CATEGORY);
    }

    if (dto.amount === undefined) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        { field: 'amount', value: null, reason: '구매 금액(amount)은 필수입니다.' },
      ]);
    }

    const supply = await this.findSupplyOrThrow(supplyId);

    if (supply.status === SupplyStatus.PURCHASED) {
      throw new BusinessException(ErrorCode.SUP_ALREADY_PURCHASED);
    }

    const prevStatus = supply.status;
    const categoryId = BigInt(dto.categoryId);
    const amount = dto.amount;

    const result = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId,
          groupId: supply.groupId,
          payerId: userId,
          createdBy: userId,
          title: supply.name,
          totalAmount: amount,
          splitType: SplitType.EQUAL,
          status: ExpenseStatus.PENDING,
        },
      });

      const updated = await tx.supply.update({
        where: { id: supplyId },
        data: { status: SupplyStatus.PURCHASED, linkedExpenseId: expense.id },
      });

      await tx.supplyLog.create({
        data: { supplyId, userId, prevStatus, nextStatus: SupplyStatus.PURCHASED, note: null },
      });

      return { expense, updated };
    });

    return {
      supplyId: Number(result.updated.id),
      status: result.updated.status,
      linkedExpenseId:
        result.updated.linkedExpenseId !== null ? Number(result.updated.linkedExpenseId) : null,
      log: { prevStatus, nextStatus: SupplyStatus.PURCHASED, note: null },
      expense: {
        expenseId: Number(result.expense.id),
        categoryId: result.expense.categoryId !== null ? Number(result.expense.categoryId) : null,
        title: result.expense.title,
        payerId: Number(result.expense.payerId),
        totalAmount: result.expense.totalAmount,
        splitType: result.expense.splitType,
        status: result.expense.status,
      },
      updatedAt: toIsoNoMillis(result.updated.updatedAt),
    };
  }

  async share(supplyId: bigint, senderId: bigint, chatRoomId: bigint, content?: string) {
    const supply = await this.findSupplyOrThrow(supplyId);

    const chatRoom = await this.prisma.chatRoom.findUnique({ where: { id: chatRoomId } });

    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    if (chatRoom.groupId !== supply.groupId) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
        {
          field: 'chatRoomId',
          value: String(chatRoomId),
          reason: '물품과 동일한 그룹의 채팅방만 공유할 수 있습니다.',
        },
      ]);
    }

    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId: senderId } },
    });

    if (!membership) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_NOT_FOUND);
    }

    const message = await this.prisma.message.create({
      data: {
        chatRoomId,
        senderId,
        type: MessageType.CARD_SUPPLY,
        content: content ?? '',
        refId: supply.id,
      },
    });

    return {
      supplyId: Number(supply.id),
      chatMessageId: Number(message.id),
      shareCard: {
        name: supply.name,
        status: supply.status,
        assignee: supply.assignee ? supply.assignee.nickname : null,
      },
      sentAt: toIsoNoMillis(message.createdAt),
    };
  }

  async deleteSupply(supplyId: bigint, requesterId: bigint): Promise<{ supplyId: number }> {
    const supply = await this.findSupplyOrThrow(supplyId);

    await this.assertDeletePermission(supply, requesterId);

    await this.prisma.$transaction(async (tx) => {
      // SupplyLog.supply 관계는 Restrict → 로그를 먼저 삭제해야 함
      await tx.supplyLog.deleteMany({ where: { supplyId } });
      // linkedExpenseId는 SetNull이므로 연결된 Expense는 유지됨
      await tx.supply.delete({ where: { id: supplyId } });
    });

    return { supplyId: Number(supply.id) };
  }

  private async createLowStockNotifications(
    tx: Prisma.TransactionClient,
    supply: SupplyWithUsers,
    status: SupplyStatus,
  ): Promise<number> {
    const message =
      status === SupplyStatus.EMPTY
        ? `'${supply.name}' 재고가 소진되었습니다.`
        : `'${supply.name}' 재고가 부족합니다.`;

    let targetUserIds: bigint[];

    if (supply.assigneeId !== null) {
      // 담당자가 있으면 담당자에게만
      targetUserIds = [supply.assigneeId];
    } else {
      // 담당자가 없으면 활성 그룹 멤버 전원
      const members = await tx.groupMember.findMany({
        where: { groupId: supply.groupId, leftAt: null, user: { isActive: true } },
        select: { userId: true },
      });
      targetUserIds = members.map((member) => member.userId);
    }

    if (targetUserIds.length === 0) {
      return 0;
    }

    const created = await tx.notification.createMany({
      data: targetUserIds.map((uid) => ({
        userId: uid,
        groupId: supply.groupId,
        type: NotificationType.SUPPLY_LOW,
        refId: supply.id,
        message,
      })),
    });

    return created.count;
  }

  private async assertDeletePermission(
    supply: SupplyWithUsers,
    requesterId: bigint,
  ): Promise<void> {
    if (supply.createdBy === requesterId) {
      return;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: requesterId, groupId: supply.groupId } },
    });

    if (!membership || membership.leftAt || membership.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.SUP_FORBIDDEN);
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

  private async findSupplyOrThrow(supplyId: bigint): Promise<SupplyWithUsers> {
    const supply = await this.prisma.supply.findUnique({
      where: { id: supplyId },
      include: SUPPLY_WITH_USERS,
    });

    if (!supply) {
      throw new BusinessException(ErrorCode.SUP_NOT_FOUND);
    }

    return supply;
  }

  private toSupplyResponse(supply: SupplyWithUsers) {
    return {
      supplyId: Number(supply.id),
      groupId: Number(supply.groupId),
      name: supply.name,
      assignee: supply.assignee ? mapUser(supply.assignee) : null,
      status: supply.status,
      linkedExpenseId: supply.linkedExpenseId ? Number(supply.linkedExpenseId) : null,
      createdBy: mapUser(supply.creator),
      createdAt: toIsoNoMillis(supply.createdAt),
      updatedAt: toIsoNoMillis(supply.updatedAt),
    };
  }
}
