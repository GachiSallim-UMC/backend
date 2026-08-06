import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptImageService } from './receipt-image.service';
import { AuthContext } from '../auth/common/auth-context.interface';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ExpensesService - settleSplit 완료/철회(isBulkComplete) 토글 검증', () => {
  let service: ExpensesService;
  let prisma: {
    expenseSplit: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    expense: {
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockAuthContext: AuthContext = {
    cognitoSub: 'auth-user-sub-123',
    accessToken: 'mock-access-token',
  };

  beforeEach(async () => {
    prisma = {
      expenseSplit: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      expense: {
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    // $transaction 콜백 실행 타입 명시
    prisma.$transaction.mockImplementation(
      (
        cb: (tx: typeof prisma) => Promise<unknown>,
      ): Promise<unknown> => cb(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ReceiptImageService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);

    // 사용자 Auth 조회 mock
    prisma.user.findFirst.mockResolvedValue({ id: 4n });
    prisma.user.findUnique.mockResolvedValue({ id: 4n });
  });

  describe('settleSplit 메서드 검증', () => {
    const mockSplitData = {
      id: 1n,
      userId: 4n,
      expenseId: 10n,
      status: 'PENDING',
      expense: {
        payerId: 4n,
        createdBy: 4n,
      },
    };

    it('1. body 생략 시 -> 대상 split은 DONE으로 전이되고 completedAt이 설정되어야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(mockSplitData);
      prisma.expenseSplit.update.mockResolvedValue({
        id: 1n,
        expenseId: 10n,
        status: 'DONE',
      });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1n, status: 'DONE' },
      ]);
      prisma.expense.update.mockResolvedValue({ id: 10n, status: 'DONE' });

      const result = await service.settleSplit(mockAuthContext, 1);

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          status: 'DONE',
          completedAt: expect.any(Date) as Date,
        },
      });
      expect(result.status).toBe('DONE');
      expect(result.isAllSettled).toBe(true);
    });

    it('2. { isBulkComplete: false } 전달 시 -> 대상 split은 REQUESTED로 되돌아가고(철회) completedAt은 설정되지 않는다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(mockSplitData);
      prisma.expenseSplit.update.mockResolvedValue({
        id: 1n,
        expenseId: 10n,
        status: 'REQUESTED',
      });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1n, status: 'REQUESTED' },
        { id: 2n, status: 'DONE' },
      ]);
      prisma.expense.update.mockResolvedValue({ id: 10n, status: 'PARTIAL' });

      const result = await service.settleSplit(mockAuthContext, 1, {
        isBulkComplete: false,
      });

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          status: 'REQUESTED',
        },
      });
      expect(result.status).toBe('REQUESTED');
      expect(result.isAllSettled).toBe(false);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { status: 'PARTIAL' },
      });
    });

    it('3. { isBulkComplete: true } 전달 시 -> 대상 split이 DONE으로 전이되고, 나머지가 남아있으면 부모 Expense는 PARTIAL로 갱신된다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(mockSplitData);
      prisma.expenseSplit.update.mockResolvedValue({
        id: 1n,
        expenseId: 10n,
        status: 'DONE',
      });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1n, status: 'DONE' },
        { id: 2n, status: 'REQUESTED' },
      ]);
      prisma.expense.update.mockResolvedValue({ id: 10n, status: 'PARTIAL' });

      const result = await service.settleSplit(mockAuthContext, 1, {
        isBulkComplete: true,
      });

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          status: 'DONE',
          completedAt: expect.any(Date) as Date,
        },
      });
      expect(result.status).toBe('DONE');
      expect(result.isAllSettled).toBe(false);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { status: 'PARTIAL' },
      });
    });

    it('4. 권한 없는 사용자가 요청할 경우 ForbiddenException을 던져야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        ...mockSplitData,
        userId: 99n,
        expense: { payerId: 99n, createdBy: 99n },
      });

      await expect(
        service.settleSplit(mockAuthContext, 1, { isBulkComplete: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('5. 존재하지 않는 splitId일 경우 BadRequestException을 던져야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);

      await expect(
        service.settleSplit(mockAuthContext, 999),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
