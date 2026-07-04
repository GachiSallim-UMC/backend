/// <reference types="jest" />
import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
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
};

describe('RulesService', () => {
  let service: RulesService;
  let prisma: MockedPrisma;

  beforeEach(() => {
    prisma = {
      group: { findUnique: jest.fn<() => Promise<unknown>>() },
      ruleCategory: { findUnique: jest.fn<() => Promise<unknown>>() },
      rule: {
        create: jest.fn<() => Promise<unknown>>() ,
        findUnique: jest.fn<() => Promise<unknown>>() ,
        update: jest.fn<() => Promise<unknown>>() ,
        delete: jest.fn<() => Promise<unknown>>() ,
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

    const result = await service.createRule({
      groupId: 1,
      categoryId: 1,
      title: '밤 11시 이후 조용히 하기',
      description: '늦은 시간에는 소음을 줄여주세요.',
    });

    expect(result).toEqual({ ruleId: 123, title: '밤 11시 이후 조용히 하기' });
    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: {
        groupId: 1n,
        categoryId: 1n,
        userId: 1n,
        title: '밤 11시 이후 조용히 하기',
        description: '늦은 시간에는 소음을 줄여주세요.',
        status: 'ACTIVE',
      },
    });
  });

  it('throws when the group does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(
      service.createRule({
        groupId: 999,
        categoryId: 1,
        title: '테스트 규칙',
        description: '설명',
      }),
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
});
