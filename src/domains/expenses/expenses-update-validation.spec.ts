import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptImageService } from './receipt-image.service';
import { SplitType, ExpenseCategory } from '@prisma/client';
import { AuthContext } from '../auth/common/auth-context.interface';
import { UpdateExpenseDto } from './dto/update-expense.dto';

describe('ExpensesService - updateExpense Validation Tests', () => {
  let service: ExpensesService;

  interface MockPrismaService {
    expense: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    expenseSplit: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  }

  const mockPrismaService: MockPrismaService = {
    expense: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    expenseSplit: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
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

  describe('지출 내역 수정 시 금액 및 비율 검증', () => {
    it('CUSTOM 방식 수정: targetMemberIds의 분담금 합계가 수정될 총액과 일치하지 않으면 BadRequestException을 던진다', async () => {
      const expenseId = 100;
      const dto: UpdateExpenseDto = {
        title: '장보기 비용 수정',
        totalAmount: 40000,
        splitType: SplitType.CUSTOM,
        targetMemberIds: [
          { userId: '1', amount: 15000 },
          { userId: '2', amount: 15000 },
        ],
      };

      mockPrismaService.expense.findUnique.mockResolvedValue({
        id: BigInt(expenseId),
        createdBy: BigInt(1),
        payerId: BigInt(1),
        totalAmount: 30000,
        splitType: SplitType.CUSTOM,
        splits: [],
      });

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      await expect(service.updateExpense(auth, expenseId, dto)).rejects.toThrow(
        new BadRequestException(
          '각 멤버별 분담금 합계(30,000원)가 총 정산 금액(40,000원)과 일치하지 않습니다.',
        ),
      );
    });

    it('RATIO 방식 수정: targetMemberIds의 비율 합계가 100%가 아니면 BadRequestException을 던진다', async () => {
      const expenseId = 101;
      const dto: UpdateExpenseDto = {
        title: '회식 비용 수정',
        totalAmount: 50000,
        splitType: SplitType.RATIO,
        targetMemberIds: [
          { userId: '1', percentage: 30 },
          { userId: '2', percentage: 50 },
        ],
      };

      mockPrismaService.expense.findUnique.mockResolvedValue({
        id: BigInt(expenseId),
        createdBy: BigInt(1),
        payerId: BigInt(1),
        totalAmount: 50000,
        splitType: SplitType.RATIO,
        splits: [],
      });

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      await expect(service.updateExpense(auth, expenseId, dto)).rejects.toThrow(
        new BadRequestException('분담 비율의 총합(80%)은 반드시 100%이어야 합니다.'),
      );
    });

    it('CUSTOM 방식 수정: 분담금 합계와 총액이 일치하면 수정을 성공적으로 진행한다', async () => {
      const expenseId = 102;
      const dto: UpdateExpenseDto = {
        title: '택시비',
        totalAmount: 20000,
        splitType: SplitType.CUSTOM,
        category: ExpenseCategory.TRANSPORT,
        targetMemberIds: [
          { userId: '1', amount: 10000 },
          { userId: '2', amount: 10000 },
        ],
      };

      mockPrismaService.expense.findUnique.mockResolvedValue({
        id: BigInt(expenseId),
        createdBy: BigInt(1),
        payerId: BigInt(1),
        totalAmount: 20000,
        splitType: SplitType.CUSTOM,
        splits: [],
      });

      mockPrismaService.expense.update.mockResolvedValue({
        id: BigInt(expenseId),
        title: '택시비',
        totalAmount: 20000,
      });
      mockPrismaService.expenseSplit.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.expenseSplit.createMany.mockResolvedValue({ count: 2 });

      const auth = { user: { id: '1' } } as unknown as AuthContext;

      const result = await service.updateExpense(auth, expenseId, dto);

      expect(result).toEqual({
        id: BigInt(expenseId),
        title: '택시비',
        totalAmount: 20000,
      });
    });
  });
});