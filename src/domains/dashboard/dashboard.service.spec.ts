import { jest } from '@jest/globals';
import {
  ChoreStatus,
  ExpenseCategory,
  ExpenseStatus,
  RepeatType,
  SupplyCategory,
  SupplyStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

type MockModel = {
  findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  aggregate: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  count: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
};

type MockedPrisma = {
  userAuthIdentity: MockModel;
  group: MockModel;
  expense: MockModel;
  chore: MockModel;
  supply: MockModel;
  activityLog: MockModel;
  chatRoomMember: MockModel;
  message: MockModel;
};

const createMockModel = (): MockModel => ({
  findUnique: jest.fn<() => Promise<unknown>>(),
  findMany: jest.fn<() => Promise<unknown>>(),
  aggregate: jest.fn<() => Promise<unknown>>(),
  count: jest.fn<() => Promise<unknown>>(),
});

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockedPrisma;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:04:37.000Z'));
    prisma = {
      userAuthIdentity: createMockModel(),
      group: createMockModel(),
      expense: createMockModel(),
      chore: createMockModel(),
      supply: createMockModel(),
      activityLog: createMockModel(),
      chatRoomMember: createMockModel(),
      message: createMockModel(),
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns dashboard data matching the group dashboard contract', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue({
      user: { id: 1n, isActive: true },
    });
    prisma.group.findUnique.mockResolvedValue({ id: 10n, members: [{ id: 100n }] });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { totalAmount: 42000 } });
    prisma.expense.count.mockResolvedValue(3);
    prisma.chore.count.mockResolvedValueOnce(2);
    prisma.chore.count.mockResolvedValueOnce(1);
    prisma.chore.findMany.mockResolvedValue([
      {
        id: 11n,
        title: 'Clean the living room',
        repeatType: RepeatType.WEEKLY,
        status: ChoreStatus.DONE,
        assignee: { nickname: 'Alex' },
      },
      {
        id: 12n,
        title: 'Take out trash',
        repeatType: RepeatType.NONE,
        status: ChoreStatus.PENDING,
        assignee: { nickname: 'Chris' },
      },
    ]);
    prisma.supply.count.mockResolvedValue(2);
    prisma.chatRoomMember.findMany.mockResolvedValue([]);
    prisma.activityLog.findMany.mockResolvedValue([
      {
        id: 41n,
        type: 'EXPENSE_CREATED',
        user: { nickname: '김영희', profileImage: 'https://example.com/profile.png' },
        description: 'Team dinner 32,000 won requested.',
        createdAt: new Date('2026-07-25T12:00:00.000Z'),
      },
    ]);
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 21n,
        title: 'Team dinner',
        category: ExpenseCategory.FOOD,
        totalAmount: 1980,
        status: ExpenseStatus.PENDING,
        payer: { id: 2n, nickname: 'Chris' },
        splits: [{ amount: 660 }, { amount: 660 }, { amount: 660 }],
      },
      {
        id: 20n,
        title: 'Groceries',
        category: ExpenseCategory.SHOPPING,
        totalAmount: 30000,
        status: ExpenseStatus.PARTIAL,
        payer: { id: 3n, nickname: 'Daniel' },
        splits: [{ amount: 10000 }, { amount: 10000 }, { amount: 10000 }],
      },
    ]);
    prisma.supply.findMany.mockResolvedValue([
      {
        id: 31n,
        name: 'Detergent',
        category: SupplyCategory.DAILY_NECESSITIES,
        status: SupplyStatus.LOW,
        assignee: { id: 3n, nickname: 'Daniel' },
      },
    ]);

    const result = await service.getDashboard('cognito-sub', 10);

    expect(result).toEqual({
      summary: {
        todayChoreCount: 2,
        unfinishedChoreCount: 1,
        unsettledAmount: 42000,
        unsettledExpenseCount: 3,
        lowSupplyCount: 2,
        unreadMessageCount: 0,
      },
      todayChores: [
        {
          choreId: 11,
          title: 'Clean the living room',
          assigneeName: 'Alex',
          repeatText: 'Weekly repeat',
          status: ChoreStatus.DONE,
        },
        {
          choreId: 12,
          title: 'Take out trash',
          assigneeName: 'Chris',
          repeatText: 'No repeat',
          status: ChoreStatus.PENDING,
        },
      ],
      unsettledExpenses: [
        {
          expenseId: 21,
          title: 'Team dinner',
          category: ExpenseCategory.FOOD,
          payerName: 'Chris',
          amountPerPerson: 660,
          status: 'UNSETTLED',
        },
        {
          expenseId: 20,
          title: 'Groceries',
          category: ExpenseCategory.SHOPPING,
          payerName: 'Daniel',
          amountPerPerson: 10000,
          status: 'UNSETTLED',
        },
      ],
      lowSupplies: [
        {
          supplyId: 31,
          name: 'Detergent',
          category: SupplyCategory.DAILY_NECESSITIES,
          status: SupplyStatus.LOW,
          assigneeName: 'Daniel',
        },
      ],
      recentActivities: [
        {
          activityId: 41,
          actorName: '김영희',
          actorProfileImage: 'https://example.com/profile.png',
          message: '김영희 님이 생활비를 등록했습니다.',

          detail: 'Team dinner 32,000 won requested.',
          createdAt: '2026-07-25T12:00:00.000Z',
        },
      ],
    });
  });

  it('queries today using Korea Standard Time and limits unsettled expenses to two', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue({
      user: { id: 1n, isActive: true },
    });
    prisma.group.findUnique.mockResolvedValue({ id: 10n, members: [{ id: 100n }] });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.expense.count.mockResolvedValue(0);
    prisma.chore.count.mockResolvedValueOnce(0);
    prisma.chore.count.mockResolvedValueOnce(0);
    prisma.chore.findMany.mockResolvedValue([]);
    prisma.supply.count.mockResolvedValue(0);
    prisma.chatRoomMember.findMany.mockResolvedValue([]);
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.supply.findMany.mockResolvedValue([]);

    await service.getDashboard('cognito-sub', 10);

    expect(prisma.chore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 10n,
          startDate: {
            gte: new Date('2026-07-24T15:00:00.000Z'),
            lt: new Date('2026-07-25T15:00:00.000Z'),
          },
        },
      }),
    );
    expect(prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });
});
