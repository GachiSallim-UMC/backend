/// <reference types="jest" />
import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleAgreementStatusValue } from './dto/update-rule-agreement.dto';
import { RulesService } from './rules.service';

type MockedPrisma = {
  group: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  ruleCategory: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  rule: {
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    delete: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  ruleAgreement: {
    upsert: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  groupMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
};

describe('RulesService', () => {
  let service: RulesService;
  let prisma: MockedPrisma;

  beforeEach(() => {
    prisma = {
      group: { findUnique: jest.fn<() => Promise<unknown>>() },
      ruleCategory: { findUnique: jest.fn<() => Promise<unknown>>() },
      rule: {
        create: jest.fn<() => Promise<unknown>>(),
        findUnique: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
        delete: jest.fn<() => Promise<unknown>>(),
      },
      ruleAgreement: {
        upsert: jest.fn<() => Promise<unknown>>(),
      },
      groupMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
    };

    service = new RulesService(prisma as unknown as PrismaService);
  });

  it('creates a rule and returns its id', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n });
    prisma.ruleCategory.findUnique.mockResolvedValue({ id: 1n });
    prisma.rule.create.mockResolvedValue({
      id: 123n,
      groupId: 1n,
      categoryId: 1n,
      userId: 10n,
      title: '밤 11시 이후 조용히 하기',
      description: '늦은 시간에는 소음을 줄여주세요.',
      status: 'ACTIVE',
    });

    const result = await service.createRule(
      {
        groupId: 1,
        categoryId: 1,
        title: '밤 11시 이후 조용히 하기',
        description: '늦은 시간에는 소음을 줄여주세요.',
      },
      10n,
    );

    expect(result).toEqual({ ruleId: 123, title: '밤 11시 이후 조용히 하기' });
    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: {
        groupId: 1n,
        categoryId: 1n,
        userId: 10n,
        title: '밤 11시 이후 조용히 하기',
        description: '늦은 시간에는 소음을 줄여주세요.',
        status: 'ACTIVE',
      },
    });
  });

  it('throws when the group does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(
      service.createRule(
        {
          groupId: 999,
          categoryId: 1,
          title: '테스트 규칙',
          description: '설명',
        },
        10n,
      ),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('deletes a rule and returns the deleted id', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, userId: 1n, groupId: 1n });
    prisma.rule.delete.mockResolvedValue({ id: 123n, title: '삭제 규칙' });

    const result = await service.deleteRule(123n, 1n);

    expect(result).toEqual({ ruleId: 123, title: '삭제 규칙' });
    expect(prisma.rule.delete).toHaveBeenCalledWith({ where: { id: 123n } });
  });

  it('throws when the rule does not exist', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(service.deleteRule(999n, 1n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('returns rule detail with agreement and history summaries', async () => {
    prisma.groupMember.findUnique.mockResolvedValue({
      id: 1n,
      userId: 10n,
      groupId: 1n,
      role: 'MEMBER',
      joinedAt: new Date(),
      leftAt: null,
    });

    prisma.rule.findUnique.mockResolvedValue({
      id: 123n,
      groupId: 1n,
      categoryId: 1n,
      userId: 10n,
      title: '밤 11시 이후 조용히 하기',
      description: '늦은 시간에는 소음을 줄여주세요.',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-03T13:00:00Z'),
      updatedAt: new Date('2026-07-03T15:00:00Z'),
      category: {
        name: '소음',
      },
      creator: {
        id: 10n,
        nickname: '홍길동',
      },
      agreements: [
        {
          id: 1n,
          ruleId: 123n,
          userId: 10n,
          status: 'AGREED',
          confirmedAt: new Date('2026-07-03T13:30:00Z'),
          user: {
            id: 10n,
            nickname: '홍길동',
          },
        },
        {
          id: 2n,
          ruleId: 123n,
          userId: 11n,
          status: 'PENDING',
          confirmedAt: null,
          user: {
            id: 11n,
            nickname: '김영희',
          },
        },
      ],
      logs: [
        {
          id: 29n,
          ruleId: 123n,
          userId: 10n,
          action: 'CREATED',
          snapshot: null,
          createdAt: new Date('2026-07-03T13:00:00Z'),
          user: {
            id: 10n,
            nickname: '홍길동',
          },
        },
      ],
    });

    const result = await service.getRule(123n, 10n);

    expect(result).toEqual({
      ruleId: 123,
      groupId: 1,
      categoryId: 1,
      categoryName: '소음',
      title: '밤 11시 이후 조용히 하기',
      description: '늦은 시간에는 소음을 줄여주세요.',
      status: 'ACTIVE',
      createdBy: {
        userId: 10,
        nickname: '홍길동',
      },
      myAgreementStatus: 'AGREED',
      agreementSummary: {
        totalCount: 2,
        agreedCount: 1,
        disagreedCount: 0,
        pendingCount: 1,
      },
      agreements: [
        {
          userId: 10,
          nickname: '홍길동',
          status: 'AGREED',
          confirmedAt: '2026-07-03T13:30:00.000Z',
        },
        {
          userId: 11,
          nickname: '김영희',
          status: 'PENDING',
          confirmedAt: null,
        },
      ],
      histories: [
        {
          logId: 29,
          action: 'CREATED',
          message: '홍길동 님이 규칙을 등록했습니다.',
          createdAt: '2026-07-03T13:00:00.000Z',
        },
      ],
      createdAt: '2026-07-03T13:00:00.000Z',
      updatedAt: '2026-07-03T15:00:00.000Z',
    });
  });

  it('throws COMMON_NOT_FOUND when the requested rule does not exist', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(service.getRule(999n, 10n)).rejects.toMatchObject({
      code: 'COMMON_404',
    });
    expect(prisma.groupMember.findUnique).not.toHaveBeenCalled();
  });

  it('creates or updates a rule agreement and returns it', async () => {
    const confirmedAt = new Date('2026-07-03T13:30:00.000Z');
    const anyDate = expect.any(Date) as unknown as Date;
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue({ id: 1n, leftAt: null });
    prisma.ruleAgreement.upsert.mockResolvedValue({
      id: 15n,
      ruleId: 123n,
      userId: 5n,
      status: 'AGREED',
      confirmedAt,
    });

    const result = await service.updateRuleAgreement(
      123n,
      { status: RuleAgreementStatusValue.AGREED },
      5n,
    );

    expect(result).toEqual({
      agreementId: 15,
      ruleId: 123,
      userId: 5,
      status: 'AGREED',
      confirmedAt: '2026-07-03T13:30:00.000Z',
    });
    expect(prisma.ruleAgreement.upsert).toHaveBeenCalledWith({
      where: { ruleId_userId: { ruleId: 123n, userId: 5n } },
      create: {
        ruleId: 123n,
        userId: 5n,
        status: RuleAgreementStatusValue.AGREED,
        confirmedAt: anyDate,
      },
      update: {
        status: RuleAgreementStatusValue.AGREED,
        confirmedAt: anyDate,
      },
    });
    expect(prisma.groupMember.findUnique).toHaveBeenCalledWith({
      where: { userId_groupId: { userId: 5n, groupId: 1n } },
    });
  });

  it('clears the confirmation time when a rule agreement becomes pending', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue({ id: 1n, leftAt: null });
    prisma.ruleAgreement.upsert.mockResolvedValue({
      id: 15n,
      ruleId: 123n,
      userId: 5n,
      status: 'PENDING',
      confirmedAt: null,
    });

    const result = await service.updateRuleAgreement(
      123n,
      { status: RuleAgreementStatusValue.PENDING },
      5n,
    );

    expect(result.confirmedAt).toBeNull();
    expect(prisma.ruleAgreement.upsert).toHaveBeenCalledWith({
      where: { ruleId_userId: { ruleId: 123n, userId: 5n } },
      create: {
        ruleId: 123n,
        userId: 5n,
        status: RuleAgreementStatusValue.PENDING,
        confirmedAt: null,
      },
      update: {
        status: RuleAgreementStatusValue.PENDING,
        confirmedAt: null,
      },
    });
  });

  it('throws when updating an agreement for a missing rule', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(
      service.updateRuleAgreement(999n, { status: RuleAgreementStatusValue.AGREED }, 5n),
    ).rejects.toMatchObject({ code: 'COMMON_404' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });

  it('throws when a non-member tries to update a rule agreement', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      service.updateRuleAgreement(123n, { status: RuleAgreementStatusValue.AGREED }, 5n),
    ).rejects.toMatchObject({ code: 'GROUP_MEMBER_NOT_FOUND' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });

  it('throws when a former member tries to update a rule agreement', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue({ id: 1n, leftAt: new Date() });

    await expect(
      service.updateRuleAgreement(123n, { status: RuleAgreementStatusValue.DISAGREED }, 5n),
    ).rejects.toMatchObject({ code: 'GROUP_MEMBER_NOT_FOUND' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });

  it('throws when requester is not a group member', async () => {
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.rule.findUnique.mockResolvedValue({
      id: 123n,
      groupId: 1n,
      categoryId: null,
      userId: 10n,
      title: '테스트 규칙',
      description: '설명',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      category: null,
      creator: { id: 10n, nickname: '홍길동' },
      agreements: [],
      logs: [],
    });

    await expect(service.getRule(123n, 99n)).rejects.toBeInstanceOf(BusinessException);
  });
});
