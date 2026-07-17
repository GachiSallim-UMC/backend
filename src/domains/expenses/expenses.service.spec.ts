/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { ExpenseNotFoundException } from './expenses.exception';
import { CreateExpenseDto } from './dto/create-expense.dto';
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
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const serviceMock: any = {
    expense: mockExpenseRepo,
    expenseSplit: mockExpenseSplitRepo,
  };

  // 트랜잭션 콜백 안에서도 서비스 자기 자신을 바라보도록 설정
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
        splitType: 'EQUAL',
        participants: [],
      };

      await expect(service.createExpense(dto)).rejects.toThrow(BadRequestException);
    });

    it('정산 요청을 정상적으로 생성해야 하며, 선결제자 우대 계산 방식이 적용되어야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        categoryId: 1,
        userId: 1,
        title: '점심 식대',
        totalAmount: 10000,
        splitType: 'EQUAL',
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
      expect(prisma.expenseSplit.createMany).toHaveBeenCalledWith({
        data: [
          { expenseId: 100, userId: 1, amount: 3332, isPaid: true },
          { expenseId: 100, userId: 2, amount: 3334, isPaid: false },
          { expenseId: 100, userId: 3, amount: 3334, isPaid: false },
        ],
      });
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

  // 6. calculateSplitsPreview 검증 추가
  describe('calculateSplitsPreview', () => {
    it('참여자가 없으면 BadRequestException을 발생시켜야 한다', async () => {
      await expect(
        service.calculateSplitsPreview({ totalAmount: 10000, participants: [] , splitType: 'EQUAL'}),
      ).rejects.toThrow(BadRequestException);
    });

    it('정산 금액과 역할(RECEIVER, SENDER)을 올바르게 계산하여 미리보기를 반환해야 한다', async () => {
      const result = await service.calculateSplitsPreview({
        totalAmount: 10000,
        participants: [1, 2, 3],
        splitType: 'EQUAL'
      });

      expect(result.totalAmount).toBe(10000);
      expect(result.calculatedSplits).toEqual([
        { userId: 1, amount: 3332, role: 'RECEIVER' },
        { userId: 2, amount: 3334, role: 'SENDER' },
        { userId: 3, amount: 3334, role: 'SENDER' },
      ]);
    });
  });

  // 7. createPayLink 검증 추가
  describe('createPayLink', () => {
    it('분담 내역이 존재하지 않으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(service.createPayLink(999)).rejects.toThrow(BadRequestException);
    });

    it('웹 표준 규격에 맞춘 토스 송금 링크를 정상적으로 발급하고 상태를 변경해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: 1, amount: 5000 });
      prisma.expenseSplit.update.mockResolvedValue({ id: 1, status: 'TRANSFER_PENDING' });

      const result = await service.createPayLink(1);

      expect(result.deepLinkUrl).toContain('https://toss.im/_m/send?bank=SHINHAN&amount=5000');
      expect(result.status).toBe('TRANSFER_PENDING');
      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'TRANSFER_PENDING' },
      });
    });
  });

  // 8. paySandboxPoc 검증 추가
  describe('paySandboxPoc', () => {
    it('분담 내역이 없으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(service.paySandboxPoc(999)).rejects.toThrow(BadRequestException);
    });

    it('샌드박스 트랜잭션 ID를 반환하고 상태를 PROCESSING으로 변경해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: 5 });
      prisma.expenseSplit.update.mockResolvedValue({ id: 5, status: 'PROCESSING' });

      const result = await service.paySandboxPoc(5);

      expect(result.transactionId).toBe('TOSS_TX_20260703_5');
      expect(result.apiStatus).toBe('PROCESSING');
      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { status: 'PROCESSING', transactionId: 'TOSS_TX_20260703_5' },
      });
    });
  });

  // 9. handleWebhook 검증 추가
  describe('handleWebhook', () => {
    it('거래 내역이 DB에 존재하지 않으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(
        service.handleWebhook({ transactionId: 'INVALID_TX', amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('이미 DONE 상태라면 멱등성 검증에 의해 바로 SUCCESS를 반환해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: 1, status: 'DONE' });

      const result = await service.handleWebhook({ transactionId: 'TOSS_TX_1', amount: 5000 });
      expect(result).toEqual({ status: 'SUCCESS' });
    });

    it('금액 불일치 시 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: 1, amount: 5000, status: 'PROCESSING' });

      await expect(
        service.handleWebhook({ transactionId: 'TOSS_TX_1', amount: 3000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // 10. settleSplit 검증 추가 (트랜잭션 및 부모 연동 검증)
  describe('settleSplit', () => {
    it('isBulkComplete가 true이고 전원이 정산 완료되지 않은 경우, 개별 분담만 DONE 처리하고 부모 Expense는 변경하지 않아야 한다', async () => {
      prisma.expenseSplit.update.mockResolvedValue({ id: 1, expenseId: 10 });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1, status: 'DONE' },
        { id: 2, status: 'REQUESTED' }, // 아직 한 명 미완료
      ]);
      prisma.expense.update = jest.fn(); // 호출되면 안 됨

      const result = await service.settleSplit(1, { isBulkComplete: true });

      expect(result.isAllSettled).toBe(false);
      expect(result.status).toBe('DONE');
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('전원 정산이 완료된 경우, 부모 Expense 상태를 DONE으로 자동 갱신해야 한다', async () => {
      prisma.expenseSplit.update.mockResolvedValue({ id: 1, expenseId: 10 });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: 1, status: 'DONE' },
        { id: 2, status: 'DONE' }, // 전원 완료!
      ]);
      prisma.expense.update = jest.fn().mockResolvedValue({ id: 10, status: 'DONE' });

      const result = await service.settleSplit(1, { isBulkComplete: true });

      expect(result.isAllSettled).toBe(true);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'DONE' },
      });
    });
  });

  // 11. shareExpenseCard 검증 추가
  describe('shareExpenseCard', () => {
    it('존재하지 않는 지출 내역이면 ExpenseNotFoundException을 발생시켜야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);
      await expect(service.shareExpenseCard(999)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('지출 내역이 존재하면 가상의 chatMessageId를 성공적으로 반환해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: 1 });
      const result = await service.shareExpenseCard(1);

      expect(result.chatMessageId).toBeGreaterThanOrEqual(7000);
    });
  });
});