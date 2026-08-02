import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma, RuleAgreementStatus, RuleStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';

const WRITE_CONFLICT_ERROR_CODE = 'P2034';
const MAX_SERIALIZABLE_RETRIES = 3;

@Injectable()
export class RuleStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationDelivery: NotificationDeliveryService,
  ) {}

  async recalculateRule(ruleId: bigint): Promise<void> {
    await this.runSerializable((tx) => this.recalculateOne(tx, ruleId));
  }

  async runWithRecalculation<T>(
    ruleId: bigint,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (tx) => {
      const result = await operation(tx);
      await this.recalculateOne(tx, ruleId);
      return result;
    });
  }

  async recalculateGroup(groupId: bigint): Promise<void> {
    await this.runSerializable(async (tx) => {
      const activeMembers = await tx.groupMember.findMany({
        where: { groupId, leftAt: null },
        select: { userId: true },
      });
      const activeUserIds = activeMembers.map(({ userId }) => userId);
      const rules = await tx.rule.findMany({ where: { groupId }, select: { id: true } });

      await tx.ruleAgreement.deleteMany({
        where: {
          rule: { groupId },
          ...(activeUserIds.length > 0 ? { userId: { notIn: activeUserIds } } : {}),
        },
      });

      if (activeUserIds.length > 0 && rules.length > 0) {
        await tx.ruleAgreement.createMany({
          data: rules.flatMap(({ id: ruleId }) =>
            activeUserIds.map((userId) => ({
              ruleId,
              userId,
              status: RuleAgreementStatus.PENDING,
            })),
          ),
          skipDuplicates: true,
        });
      }

      for (const { id } of rules) {
        await this.recalculateOne(tx, id);
      }
    });
  }

  private async recalculateOne(tx: Prisma.TransactionClient, ruleId: bigint): Promise<void> {
    const rule = await tx.rule.findUnique({
      where: { id: ruleId },
      select: { id: true, groupId: true, title: true, status: true },
    });
    if (!rule) return;

    const memberCount = await tx.groupMember.count({
      where: { groupId: rule.groupId, leftAt: null },
    });
    const agreedCount = await tx.ruleAgreement.count({
      where: {
        ruleId,
        status: RuleAgreementStatus.AGREED,
        user: { groupMembers: { some: { groupId: rule.groupId, leftAt: null } } },
      },
    });
    const nextStatus =
      memberCount > 0 && agreedCount === memberCount ? RuleStatus.ACTIVE : RuleStatus.INACTIVE;

    if (rule.status === nextStatus) return;

    const updated = await tx.rule.update({
      where: { id: ruleId },
      data: { status: nextStatus },
      select: { updatedAt: true },
    });

    if (nextStatus === RuleStatus.ACTIVE) {
      await this.createActivationNotifications(tx, {
        ruleId,
        groupId: rule.groupId,
        title: rule.title,
        activatedAt: updated.updatedAt,
      });
    }
  }

  private async createActivationNotifications(
    tx: Prisma.TransactionClient,
    rule: ActivatedRule,
  ): Promise<void> {
    const members = await tx.groupMember.findMany({
      where: { groupId: rule.groupId, leftAt: null, user: { isActive: true } },
      select: { userId: true },
    });

    for (const { userId } of members) {
      await this.notificationDelivery.createNotificationInTransaction(tx, {
        userId,
        groupId: rule.groupId,
        type: NotificationType.RULE_CHANGED,
        refId: rule.ruleId,
        message: `규칙 '${rule.title}'이(가) 모든 그룹원의 동의를 받아 활성화되었습니다.`,
        dedupeKey: `rule:${rule.ruleId}:activated:${rule.activatedAt.toISOString()}:user:${userId}`,
      });
    }
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isWriteConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === WRITE_CONFLICT_ERROR_CODE;
        if (!isWriteConflict || attempt === MAX_SERIALIZABLE_RETRIES) throw error;
      }
    }
    throw new Error('unreachable');
  }
}

interface ActivatedRule {
  ruleId: bigint;
  groupId: bigint;
  title: string;
  activatedAt: Date;
}
