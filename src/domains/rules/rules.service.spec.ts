/// <reference types="jest" />
import { jest } from '@jest/globals';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleAgreementStatusValue } from './dto/update-rule-agreement.dto';
import { RuleStatusValue } from './dto/update-rule.dto';
import { RulesService } from './rules.service';

type MockedPrisma = {
  group: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  ruleCategory: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  rule: {
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
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
  chatRoom: {
    findFirst: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  chatRoomMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  message: {
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
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
        findMany: jest.fn<() => Promise<unknown>>(),
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
      chatRoom: {
        findFirst: jest.fn<() => Promise<unknown>>(),
      },
      chatRoomMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      message: {
        create: jest.fn<() => Promise<unknown>>(),
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
      title: '규칙 1 설명',
      description: '테스트를 위한 샘플 규칙 텍스트',
      status: RuleStatusValue.ACTIVE,
    });

    const result = await service.createRule(
      {
        groupId: 1,
        categoryId: 1,
        title: '규칙 1 설명',
        description: '테스트를 위한 샘플 규칙 텍스트',
      },
      10n,
    );

    expect(result).toEqual({ ruleId: 123, title: '규칙 1 설명' });
    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: {
        groupId: 1n,
        categoryId: 1n,
        userId: 10n,
        title: '규칙 1 설명',
        description: '테스트를 위한 샘플 규칙 텍스트',
        status: RuleStatusValue.ACTIVE,
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
          title: '새 그룹 규칙',
          description: '테스트',
        },
        10n,
      ),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the category does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n });
    prisma.ruleCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.createRule(
        {
          groupId: 1,
          categoryId: 999,
          title: '카테고리 없음',
          description: '없는 카테고리로 생성',
        },
        10n,
      ),
    ).rejects.toMatchObject({ code: 'RULE_404_CATEGORY' });
    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it('updates a rule and returns the updated id and title', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, userId: 1n, groupId: 1n });
    prisma.ruleCategory.findUnique.mockResolvedValue({ id: 2n });
    prisma.rule.update.mockResolvedValue({
      id: 123n,
      groupId: 1n,
      categoryId: 2n,
      userId: 1n,
      title: '수정된 규칙 제목',
    });

    const result = await service.updateRule(
      123,
      {
        categoryId: 2,
        title: '수정된 규칙 제목',
        description: '수정된 설명',
        status: RuleStatusValue.INACTIVE,
      },
      1n,
    );

    expect(result).toEqual({ ruleId: 123, title: '수정된 규칙 제목' });
    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: 123n },
      data: {
        categoryId: 2n,
        title: '수정된 규칙 제목',
        description: '수정된 설명',
        status: RuleStatusValue.INACTIVE,
      },
    });
  });

  it('throws when updating a missing rule', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(
      service.updateRule(999, { categoryId: 1, title: '없음', description: '없음', status: RuleStatusValue.ACTIVE }, 1n),
    ).rejects.toMatchObject({ code: 'COMMON_404' });
    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it('throws when trying to update a rule by another user', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, userId: 2n });

    await expect(
      service.updateRule(
        123,
        { categoryId: 1, title: '권한 없음', description: '수정 실패', status: RuleStatusValue.ACTIVE },
        1n,
      ),
    ).rejects.toMatchObject({ code: 'COMMON_403' });
    expect(prisma.rule.update).not.toHaveBeenCalled();
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

  it('throws when trying to delete a rule by another user', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, userId: 2n, groupId: 1n });

    await expect(service.deleteRule(123, 1n)).rejects.toMatchObject({ code: 'COMMON_403' });
    expect(prisma.rule.delete).not.toHaveBeenCalled();
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

  it('returns rules with correct agreement summaries', async () => {
    prisma.rule.findMany.mockResolvedValue([
      {
        id: 123n,
        groupId: 10n,
        categoryId: null,
        title: '규칙 제목',
        description: '설명',
        status: RuleStatusValue.ACTIVE,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        creator: { id: 8n, nickname: '작성자' },
        agreements: [
          { status: 'AGREED' },
          { status: 'DISAGREED' },
          { status: 'PENDING' },
          { status: 'AGREED' },
        ],
      },
    ]);

    const result = await service.getRules({ groupId: 10 });

    expect(result).toEqual({
      rules: [
        {
          ruleId: 123,
          groupId: 10,
          categoryId: null,
          title: '규칙 제목',
          description: '설명',
          status: RuleStatusValue.ACTIVE,
          createdBy: {
            userId: 8,
            nickname: '작성자',
          },
          agreementSummary: {
            totalCount: 4,
            agreedCount: 2,
            disagreedCount: 1,
            pendingCount: 1,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
    expect(prisma.rule.findMany).toHaveBeenCalledWith({
      where: { groupId: 10n },
      include: {
        creator: {
          select: {
            id: true,
            nickname: true,
          },
        },
        agreements: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });

  it('creates a CARD_RULE message in the default group chat room', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.chatRoom.findFirst.mockResolvedValue({ id: 3n, groupId: 1n, isDefault: true });
    prisma.chatRoomMember.findUnique.mockResolvedValue({ id: 20n });
    prisma.message.create.mockResolvedValue({ id: 456n });

    await expect(service.shareRule(123, 5n)).resolves.toEqual({
      ruleId: 123,
      messageId: 456,
    });
    expect(prisma.chatRoom.findFirst).toHaveBeenCalledWith({
      where: { groupId: 1n, isDefault: true },
    });
    expect(prisma.chatRoomMember.findUnique).toHaveBeenCalledWith({
      where: { chatRoomId_userId: { chatRoomId: 3n, userId: 5n } },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        chatRoomId: 3n,
        senderId: 5n,
        type: 'CARD_RULE',
        content: '',
        refId: 123n,
      },
    });
  });

  it('throws when sharing a missing rule', async () => {
    prisma.rule.findUnique.mockResolvedValue(null);

    await expect(service.shareRule(999, 5n)).rejects.toMatchObject({ code: 'COMMON_404' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('throws when the rule group has no default chat room', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.chatRoom.findFirst.mockResolvedValue(null);

    await expect(service.shareRule(123, 5n)).rejects.toMatchObject({
      code: 'CHAT_ROOM_404',
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('throws when the sender is not a member of the default chat room', async () => {
    prisma.rule.findUnique.mockResolvedValue({ id: 123n, groupId: 1n });
    prisma.chatRoom.findFirst.mockResolvedValue({ id: 3n, groupId: 1n, isDefault: true });
    prisma.chatRoomMember.findUnique.mockResolvedValue(null);

    await expect(service.shareRule(123, 5n)).rejects.toMatchObject({
      code: 'CHAT_ROOM_MEMBER_404',
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
