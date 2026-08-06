import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptImageService } from './receipt-image.service';
import { SplitType, ExpenseCategory } from '@prisma/client';
import { AuthContext } from '../auth/common/auth-context.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';

describe('ExpensesService - createExpense Validation Tests', () => {
  let service: ExpensesService;

  // ESLint 타입 안전성을 위해 Mock 메서드의 명시적 인터페이스 정의
  interface MockPrismaService {
    groupMember: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
    };
    expense: {
      create: jest.Mock;
    };
    expenseSplit: {
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  }

  const mockPrismaService: MockPrismaService = {
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    expense: {
      create: jest.fn(),
    },
    expenseSplit: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(
      <T>(callback: (tx: MockPrismaService) => Promise<T>): Promise<T> =>
        callback(mockPrismaService),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ReceiptImageService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);

    jest
      .spyOn(
        service as unknown as {
          getUserIdByAuth: (auth: AuthContext) => Promise<bigint>;
        },
        'getUserIdByAuth',
      )
      .mockResolvedValue(BigInt(1));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('정산 금액 및 비율 합계 검증', () => {
    it('CUSTOM 방식: 멤버별 분담금 합계가 총 정산 금액과 일치하지 않으면 BadRequestException을 던진다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        title: '장보기 비용',
        amount: 30000,
        payerId: '1',
        date: '2026-07-28',
        splitType: SplitType.CUSTOM,
        category: ExpenseCategory.FOOD,
        targetMemberIds: [
          { userId: '1', amount: 10000 },
          { userId: '2', amount: 10000 },
        ],
      };

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      await expect(service.createExpense(auth, dto)).rejects.toThrow(
        new BadRequestException(
          '각 멤버별 분담금 합계(20,000원)가 총 정산 금액(30,000원)과 일치하지 않습니다.',
        ),
      );
    });

    it('RATIO 방식: 분담 비율의 총합이 100%가 아니면 BadRequestException을 던진다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        title: '회식 비용',
        amount: 50000,
        payerId: '1',
        date: '2026-07-28',
        splitType: SplitType.RATIO,
        category: ExpenseCategory.FOOD,
        targetMemberIds: [
          { userId: '1', percentage: 40 },
          { userId: '2', percentage: 40 },
        ],
      };

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      await expect(service.createExpense(auth, dto)).rejects.toThrow(
        new BadRequestException('분담 비율의 총합(80%)은 반드시 100%이어야 합니다.'),
      );
    });

    it('CUSTOM 방식: 분담금 합계와 총액이 일치하면 검증을 통과한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        title: '커피',
        amount: 10000,
        payerId: '1',
        date: '2026-07-28',
        splitType: SplitType.CUSTOM,
        category: ExpenseCategory.CAFE,
        targetMemberIds: [
          { userId: '1', amount: 5000 },
          { userId: '2', amount: 5000 },
        ],
      };

      mockPrismaService.groupMember.findFirst.mockResolvedValue({ id: BigInt(1) });
      mockPrismaService.user.findMany.mockResolvedValue([{ id: BigInt(1) }, { id: BigInt(2) }]);
      mockPrismaService.groupMember.findMany.mockResolvedValue([
        { userId: BigInt(1) },
        { userId: BigInt(2) },
      ]);
      mockPrismaService.expense.create.mockResolvedValue({ id: BigInt(100) });
      mockPrismaService.expenseSplit.createMany.mockResolvedValue({ count: 2 });

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      const result = await service.createExpense(auth, dto);

      expect(result).toEqual({
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: 100,
      });
    });
  });
});