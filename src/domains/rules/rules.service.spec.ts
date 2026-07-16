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

    const result = await service.deleteRule(123, 1n);

    expect(result).toEqual({ ruleId: 123, title: '삭제 규칙' });
    expect(prisma.rule.delete).toHaveBeenCalledWith({ where: { id: 123n } });
  });

  it('throws when the rule does not exist', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(service.deleteRule(999, 1n)).rejects.toBeInstanceOf(BusinessException);
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
      123,
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
      123,
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
      service.updateRuleAgreement(999, { status: RuleAgreementStatusValue.AGREED }, 5n),
    ).rejects.toMatchObject({ code: 'COMMON_404' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });

  it('throws when a non-member tries to update a rule agreement', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      service.updateRuleAgreement(123, { status: RuleAgreementStatusValue.AGREED }, 5n),
    ).rejects.toMatchObject({ code: 'GROUP_MEMBER_NOT_FOUND' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });

  it('throws when a former member tries to update a rule agreement', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.groupMember.findUnique.mockResolvedValue({ id: 1n, leftAt: new Date() });

    await expect(
      service.updateRuleAgreement(123, { status: RuleAgreementStatusValue.DISAGREED }, 5n),
    ).rejects.toMatchObject({ code: 'GROUP_MEMBER_NOT_FOUND' });
    expect(prisma.ruleAgreement.upsert).not.toHaveBeenCalled();
  });
});
