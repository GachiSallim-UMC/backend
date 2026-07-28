import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext } from '../auth/common/auth-context.interface';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ExpensesService - settleSplit 기본값(isBulkComplete: false) 및 상태 전이 검증', () => {
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
      findFirst: jest.Mock; // findFirst 추가
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
        findFirst: jest.fn(), // 👈 findFirst 메서드 모킹
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);

    // 사용자 Auth 조회 mock (BigInt ID: 4n)
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

    it('1. body 생략 시 (기본값 false 적용) -> status가 REQUESTED로 변경되어야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(mockSplitData);
      prisma.expenseSplit.update.mockResolvedValue({
        id: 1n,
        expenseId: 10n,
        status: 'REQUESTED',
      });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1n, status: 'REQUESTED' },
      ]);

      // settleDto 전달 안 함
      const result = await service.settleSplit(mockAuthContext, 1);

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { status: 'REQUESTED' },
      });
      expect(result.status).toBe('REQUESTED');
      expect(result.isAllSettled).toBe(false);
    });

    it('2. { isBulkComplete: false } 명시적 전달 시 -> status가 REQUESTED로 변경되어야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(mockSplitData);
      prisma.expenseSplit.update.mockResolvedValue({
        id: 1n,
        expenseId: 10n,
        status: 'REQUESTED',
      });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1n, status: 'REQUESTED' },
      ]);

      const result = await service.settleSplit(mockAuthContext, 1, {
        isBulkComplete: false,
      });

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { status: 'REQUESTED' },
      });
      expect(result.status).toBe('REQUESTED');
    });

    it('3. { isBulkComplete: true } 전달 시 -> status가 DONE으로 전이되고 completedAt이 설정되어야 한다', async () => {
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

      const result = await service.settleSplit(mockAuthContext, 1, {
        isBulkComplete: true,
      });

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          status: 'DONE',
          completedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe('DONE');
      expect(result.isAllSettled).toBe(true);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { status: 'DONE' },
      });
    });

    it('4. 권한 없는 사용자가 요청할 경우 ForbiddenException을 던져야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        ...mockSplitData,
        userId: 99n, // 다른 유저의 분담 내역
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