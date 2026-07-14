/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { ExpenseNotFoundException } from './expenses.exception';
import { CreateExpenseDto, SplitType } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const mockPrismaService = (): any => {
  const mockExpenseRepo = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockExpenseSplitRepo = {
    createMany: jest.fn(),
    update: jest.fn(),
  };

  // 1. 먼저 타입을 any로 명시하여 변수를 선언
  const serviceMock: any = {
    expense: mockExpenseRepo,
    expenseSplit: mockExpenseSplitRepo,
  };

  // 2. 선언이 끝난 객체에 $transaction 메서드를 따로 주입해서 순환 추론 에러를 차단
  serviceMock.$transaction = jest.fn((callback: (tx: any) => any) => callback(serviceMock));

  return serviceMock;
};

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: PrismaService,
          useFactory: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createExpense', () => {
    it('정산 대상 멤버가 없으면 BadRequestException을 던져야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        categoryId: 1,
        userId: 1,
        title: '테스트 지출',
        totalAmount: 30000,
        splitType: SplitType.EQUAL, 
        participants: [],
      };

      await expect(service.createExpense(dto)).rejects.toThrow(BadRequestException);
    });

    it('정산 요청을 정상적으로 생성해야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        categoryId: 1,
        userId: 1,
        title: '점심 식대',
        totalAmount: 30000,
        splitType: SplitType.EQUAL, 
        participants: [1, 2, 3],
      };

      prisma.expense.create.mockResolvedValue({ id: 100 });
      prisma.expenseSplit.createMany.mockResolvedValue({ count: 3 });

      const result = await service.createExpense(dto);

      expect(result).toEqual({
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: 100,
      });
      expect(prisma.expense.create).toHaveBeenCalled();
      expect(prisma.expenseSplit.createMany).toHaveBeenCalled();
    });
  });

  describe('getExpenseDetail', () => {
    it('존재하지 않는 지출 내역이면 ExpenseNotFoundException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.getExpenseDetail(999)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('존재하는 지출 내역의 상세 정보를 반환해야 한다', async () => {
      const mockExpense = { id: 1, title: '테스트', splits: [] };
      prisma.expense.findUnique.mockResolvedValue(mockExpense);

      const result = await service.getExpenseDetail(1);
      expect(result).toEqual(mockExpense);
    });
  });

  describe('updateExpense', () => {
    it('수정하려는 지출 내역이 없으면 ExpenseNotFoundException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);
      const dto: UpdateExpenseDto = { title: '수정 제목' };

      await expect(service.updateExpense(999, dto)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('지출 내역을 성공적으로 수정해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: 1 });
      prisma.expense.update.mockResolvedValue({ id: 1, title: '수정 완료' });
      const dto: UpdateExpenseDto = { title: '수정 완료' };

      const result = await service.updateExpense(1, dto);
      expect(result.title).toBe('수정 완료');
    });
  });

  describe('deleteExpense', () => {
    it('삭제하려는 지출 내역이 없으면 ExpenseNotFoundException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.deleteExpense(999)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('지출 내역을 성공적으로 삭제해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: 1 });
      prisma.expense.delete.mockResolvedValue({ id: 1 });

      const result = await service.deleteExpense(1);
      expect(result).toEqual({
        message: '지출 내역이 성공적으로 삭제되었습니다.',
        deletedExpenseId: 1,
      });
    });
  });
});