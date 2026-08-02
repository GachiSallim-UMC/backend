/// <reference types="jest" />
import { jest } from '@jest/globals';
import { RuleStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { RuleStatusService } from './rule-status.service';

describe('RuleStatusService', () => {
  const rule = {
    id: 7n,
    groupId: 3n,
    title: '공용 공간 정리하기',
    status: RuleStatus.INACTIVE,
  };
  const findRule = jest.fn<() => Promise<unknown>>();
  const findRules = jest.fn<() => Promise<unknown>>();
  const updateRule = jest.fn<() => Promise<unknown>>();
  const countAgreements = jest.fn<() => Promise<number>>();
  const deleteAgreements = jest.fn<() => Promise<unknown>>();
  const createAgreements = jest.fn<() => Promise<unknown>>();
  const countMembers = jest.fn<() => Promise<number>>();
  const findMembers = jest.fn<() => Promise<unknown>>();
  const createNotificationInTransaction = jest.fn<() => Promise<unknown>>();
  let service: RuleStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    findRule.mockResolvedValue(rule);
    updateRule.mockResolvedValue({ updatedAt: new Date('2026-08-02T00:00:00.000Z') });
    countMembers.mockResolvedValue(2);
    findMembers.mockResolvedValue([{ userId: 10n }, { userId: 20n }]);
    createNotificationInTransaction.mockResolvedValue({});

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prisma),
      ),
      rule: { findUnique: findRule, findMany: findRules, update: updateRule },
      ruleAgreement: {
        count: countAgreements,
        deleteMany: deleteAgreements,
        createMany: createAgreements,
      },
      groupMember: { count: countMembers, findMany: findMembers },
    };
    service = new RuleStatusService(
      prisma as unknown as PrismaService,
      {
        createNotificationInTransaction,
      } as unknown as NotificationDeliveryService,
    );
  });

  it('모든 현재 그룹원이 동의하면 ACTIVE로 전환하고 그룹원에게 알린다', async () => {
    countAgreements.mockResolvedValue(2);

    await service.recalculateRule(7n);

    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { status: RuleStatus.ACTIVE },
      select: { updatedAt: true },
    });
    expect(createNotificationInTransaction).toHaveBeenCalledTimes(2);
    expect(createNotificationInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ groupId: 3n, refId: 7n, userId: 10n, type: 'RULE_CHANGED' }),
    );
  });

  it('한 명이라도 동의하지 않았으면 INACTIVE를 유지하고 알리지 않는다', async () => {
    countAgreements.mockResolvedValue(1);

    await service.recalculateRule(7n);

    expect(updateRule).not.toHaveBeenCalled();
    expect(createNotificationInTransaction).not.toHaveBeenCalled();
  });

  it('그룹원 변경 시 탈퇴자의 동의를 제거하고 신규 동의 대상을 PENDING으로 만든다', async () => {
    findRules.mockResolvedValue([{ id: 7n }]);
    countAgreements.mockResolvedValue(1);
    deleteAgreements.mockResolvedValue({ count: 1 });
    createAgreements.mockResolvedValue({ count: 1 });

    await service.recalculateGroup(3n);

    expect(deleteAgreements).toHaveBeenCalledWith({
      where: { rule: { groupId: 3n }, userId: { notIn: [10n, 20n] } },
    });
    expect(createAgreements).toHaveBeenCalledWith({
      data: [
        { ruleId: 7n, userId: 10n, status: 'PENDING' },
        { ruleId: 7n, userId: 20n, status: 'PENDING' },
      ],
      skipDuplicates: true,
    });
  });
});
