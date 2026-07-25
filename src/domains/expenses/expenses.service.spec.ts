/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseNotFoundException } from './expenses.exception';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AuthContext } from '../auth/common/auth-context.interface';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { ExpenseCategory, SplitType } from '@prisma/client';
import * as crypto from 'crypto';

const mockPrismaService = (): any => {
  const mockUserRepo = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };

  const mockGroupMemberRepo = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };

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

  const mockChatRoomRepo = {
    findFirst: jest.fn(),
  };

  const mockChatRoomMemberRepo = {
    findUnique: jest.fn(),
  };

  const mockMessageRepo = {
    create: jest.fn(),
  };

  const serviceMock: any = {
    user: mockUserRepo,
    groupMember: mockGroupMemberRepo,
    expense: mockExpenseRepo,
    expenseSplit: mockExpenseSplitRepo,
    chatRoom: mockChatRoomRepo,
    chatRoomMember: mockChatRoomMemberRepo,
    message: mockMessageRepo,
  };

  serviceMock.$transaction = jest.fn((callback: (tx: any) => any) => callback(serviceMock));

  return serviceMock;
};

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: any;

  const mockAuthContext: AuthContext = {
    cognitoSub: 'test-cognito-sub-123',
    accessToken: 'mock-access-token',
  };

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

    prisma.user.findFirst.mockResolvedValue({ id: BigInt(12) });
    prisma.groupMember.findFirst.mockResolvedValue({ id: BigInt(1), groupId: BigInt(1), userId: BigInt(12) });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // 1. createExpense 검증
  // =========================================================================
  describe('createExpense', () => {
    it('정산 대상 멤버가 없으면 BadRequestException을 던져야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '테스트 지출',
        amount: 30000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [],
      };

      await expect(service.createExpense(mockAuthContext, dto)).rejects.toThrow(BadRequestException);
    });

    it('정산 요청을 정상적으로 생성해야 하며, 소액/나머지 분배 방식이 올바르게 적용되어야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '점심 식대',
        amount: 10000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [{ userId: '12' }, { userId: '2' }, { userId: '3' }],
      };

      prisma.user.findMany.mockResolvedValue([{ id: BigInt(12) }, { id: BigInt(2) }, { id: BigInt(3) }]);
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: BigInt(12) },
        { userId: BigInt(2) },
        { userId: BigInt(3) },
      ]);

      prisma.expense.create.mockResolvedValue({ id: BigInt(100) });
      prisma.expenseSplit.createMany.mockResolvedValue({ count: 3 });

      const result = await service.createExpense(mockAuthContext, dto);

      expect(result).toEqual({
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: 100,
      });
      expect(prisma.expense.create).toHaveBeenCalled();
      expect(prisma.expenseSplit.createMany).toHaveBeenCalled();
    });

    it('CUSTOM 분담 방식일 때 지정된 금액으로 정산 요청이 올바르게 생성되어야 한다', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 12n }, { id: 2n }] as any);
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([{ userId: 12n }, { userId: 2n }] as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return await callback({
          expense: {
            create: jest.fn().mockResolvedValue({ id: 1n }),
          },
          expenseSplit: {
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '회식비 저녁',
        amount: 50000,
        splitType: SplitType.CUSTOM,
        targetMemberIds: [
          { userId: '12', amount: 30000 },
          { userId: '2', amount: 20000 },
        ],
      };

      const result = await service.createExpense(mockAuthContext, dto);

      expect(result).toHaveProperty('message', '정산 요청이 성공적으로 생성되었습니다.');
      expect(result).toHaveProperty('expenseId');
    });

    it('RATIO 분담 방식일 때 입력된 비율에 따라 금액이 올바르게 계산되어 생성되어야 한다', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 12n }, { id: 2n }] as any);
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([{ userId: 12n }, { userId: 2n }] as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return await callback({
          expense: {
            create: jest.fn().mockResolvedValue({ id: 1n }),
          },
          expenseSplit: {
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.ETC,
        payerId: '12',
        date: '2026-07-23',
        title: '펜션 예약비',
        amount: 100000,
        splitType: SplitType.RATIO,
        targetMemberIds: [
          { userId: '12', percentage: 60 },
          { userId: '2', percentage: 40 },
        ],
      };

      const result = await service.createExpense(mockAuthContext, dto);

      expect(result).toHaveProperty('message', '정산 요청이 성공적으로 생성되었습니다.');
      expect(result).toHaveProperty('expenseId');
    });
  });

  // =========================================================================
  // 2. getExpenseDetail 검증
  // =========================================================================
  describe('getExpenseDetail', () => {
    it('존재하지 않는 지출 내역이면 ExpenseNotFoundException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.getExpenseDetail(mockAuthContext, 999)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('그룹 멤버가 아닌 사용자가 접근 시 ForbiddenException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: BigInt(1), groupId: BigInt(1) });
      prisma.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.getExpenseDetail(mockAuthContext, 1)).rejects.toThrow(ForbiddenException);
    });

    it('존재하는 지출 내역의 상세 정보를 반환해야 한다', async () => {
      const mockExpense = { id: BigInt(1), groupId: BigInt(1), title: '테스트', splits: [] };
      prisma.expense.findUnique.mockResolvedValue(mockExpense);

      const result = await service.getExpenseDetail(mockAuthContext, 1);
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 3. updateExpense 검증
  // =========================================================================
  describe('updateExpense', () => {
    it('수정하려는 지출 내역이 없으면 ExpenseNotFoundException을 던져야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(null);

      await expect(
        service.updateExpense(mockAuthContext, 999, { title: '수정 테스트' }),
      ).rejects.toThrow(ExpenseNotFoundException);
    });

    it('생성자나 결제자가 아닌 유저가 수정 시 ForbiddenException을 던져야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 1n,
        createdBy: 99n,
        payerId: 99n,
        splits: [],
      } as any);

      await expect(
        service.updateExpense(mockAuthContext, 1, { title: '수정 테스트' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('지출 내역 수정 시 EQUAL 방식이면 변경된 총액에 맞게 ExpenseSplit이 N분의 1로 재계산되어야 한다', async () => {
      // 1. 기존 Expense 및 Splits Mock 설정 (총액 30,000원 -> 2명 각 15,000원)
      const mockExistingExpense = {
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        totalAmount: 30000,
        splitType: SplitType.EQUAL,
        splits: [
          { id: 101n, userId: 12n, amount: 15000 },
          { id: 102n, userId: 2n, amount: 15000 },
        ],
      };

      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(mockExistingExpense as any);

      const mockUpdate = jest.fn().mockResolvedValue({ ...mockExistingExpense, totalAmount: 50000 });
      const mockSplitUpdate = jest.fn().mockResolvedValue({});

      jest.spyOn(prisma, '$transaction').mockImplementation((callback: any) => {
        return callback({
          expense: { update: mockUpdate },
          expenseSplit: { update: mockSplitUpdate },
        });
      });

      // 2. 총액을 50,000원으로 수정 요청 (2명이므로 25,000원씩 재계산)
      const updateDto = {
        totalAmount: 50000,
      };

      // ⭕ any 변수 할당 대신 실행 처리 및 타입 단축
      await service.updateExpense(mockAuthContext, 1, updateDto);

      // ⭕ mockUpdate.mock.calls 직접 검증 (expect.objectContaining 제거로 no-unsafe-assignment 해결)
      const updateCall = mockUpdate.mock.calls[0][0] as {
        where: { id: bigint };
        data: { totalAmount?: number };
      };

      expect(updateCall.where).toEqual({ id: 1n });
      expect(updateCall.data.totalAmount).toBe(50000);

      // 3. 각 ExpenseSplit의 amount가 25,000원으로 갱신되었는지 확인
      expect(mockSplitUpdate).toHaveBeenCalledWith({
        where: { id: 101n },
        data: { amount: 25000 },
      });
      expect(mockSplitUpdate).toHaveBeenCalledWith({
        where: { id: 102n },
        data: { amount: 25000 },
      });
    });

    it('지출 내역 수정 시 RATIO 방식이면 기존 비율에 맞춰 ExpenseSplit이 비례 재계산되어야 한다', async () => {
      // 1. 기존 Expense 및 Splits Mock 설정 (총액 100,000원 -> 60%:40% 비율인 60,000원/40,000원)
      const mockExistingExpense = {
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        totalAmount: 100000,
        splitType: SplitType.RATIO,
        splits: [
          { id: 101n, userId: 12n, amount: 60000 },
          { id: 102n, userId: 2n, amount: 40000 },
        ],
      };

      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(mockExistingExpense as any);

      const mockUpdate = jest.fn().mockResolvedValue({ ...mockExistingExpense, totalAmount: 200000 });
      const mockSplitUpdate = jest.fn().mockResolvedValue({});

      jest.spyOn(prisma, '$transaction').mockImplementation((callback: any) => {
        return callback({
          expense: { update: mockUpdate },
          expenseSplit: { update: mockSplitUpdate },
        });
      });

      // 2. 총액을 200,000원으로 수정 요청 (60%:40% 비율 유지 -> 120,000원/80,000원 재계산)
      const updateDto = {
        totalAmount: 200000,
      };

      await service.updateExpense(mockAuthContext, 1, updateDto);

      // ⭕ mockUpdate.mock.calls 직접 검증 (expect.objectContaining 제거로 no-unsafe-assignment 해결)
      const updateCall = mockUpdate.mock.calls[0][0] as {
        where: { id: bigint };
        data: { totalAmount?: number };
      };

      expect(updateCall.where).toEqual({ id: 1n });
      expect(updateCall.data.totalAmount).toBe(200000);

      // 3. 비율대로 갱신되었는지 확인 (120,000원 / 80,000원)
      expect(mockSplitUpdate).toHaveBeenCalledWith({
        where: { id: 101n },
        data: { amount: 120000 },
      });
      expect(mockSplitUpdate).toHaveBeenCalledWith({
        where: { id: 102n },
        data: { amount: 80000 },
      });
    });

  // =========================================================================
  // 4. deleteExpense 검증
  // =========================================================================
  describe('deleteExpense', () => {
    it('삭제하려는 지출 내역이 없으면 ExpenseNotFoundException을 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.deleteExpense(mockAuthContext, 999)).rejects.toThrow(ExpenseNotFoundException);
    });

    it('지출 내역을 성공적으로 삭제해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: BigInt(1), createdBy: BigInt(12) });
      prisma.expense.delete.mockResolvedValue({ id: BigInt(1) });

      const result = await service.deleteExpense(mockAuthContext, 1);
      expect(result).toEqual({
        message: '지출 내역이 성공적으로 삭제되었습니다.',
        deletedExpenseId: 1,
      });
    });
  });

  // =========================================================================
  // 5. calculateSplitsPreview 검증
  // =========================================================================
  describe('calculateSplitsPreview', () => {
    it('참여자가 없으면 BadRequestException을 발생시켜야 한다', () => {
      try {
        service.calculateSplitsPreview(mockAuthContext, {
          totalAmount: 10000,
          participants: [],
          splitType: SplitType.EQUAL,
        });
        fail('예외가 발생해야 합니다.');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    it('1원을 3명이 나눌 때 음수 없이 몫과 나머지가 정확히 분배되어야 한다', () => {
      const result = service.calculateSplitsPreview(mockAuthContext, {
        totalAmount: 1,
        participants: [12, 2, 3],
        splitType: SplitType.EQUAL,
      });

      expect(result.totalAmount).toBe(1);
      expect(result.calculatedSplits).toHaveLength(3);
      expect(result.calculatedSplits[0].amount).toBe(1);
      expect(result.calculatedSplits[1].amount).toBe(0);
      expect(result.calculatedSplits[2].amount).toBe(0);
    });
  });

  // =========================================================================
  // 6. createPayLink 검증
  // =========================================================================
  describe('createPayLink', () => {
    it('분담 내역이 존재하지 않으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(service.createPayLink(mockAuthContext, 999)).rejects.toThrow(BadRequestException);
    });

    it('웹 표준 규격에 맞춘 토스 송금 링크를 정상적으로 발급하고 상태를 변경해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: BigInt(1), userId: BigInt(12), amount: 5000 });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(1), status: 'TRANSFER_PENDING' });

      const result = await service.createPayLink(mockAuthContext, 1);

      expect(result.deepLinkUrl).toContain('supertoss://send?bank=SHINHAN&accountNo=110123456789&amount=5000');
      expect(result.status).toBe('TRANSFER_PENDING');
    });
  });

  // =========================================================================
  // 7. paySandboxPoc 검증
  // =========================================================================
  describe('paySandboxPoc', () => {
    it('분담 내역이 없으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(service.paySandboxPoc(mockAuthContext, 999)).rejects.toThrow(BadRequestException);
    });

    it('예측 불가능한 샌드박스 트랜잭션 ID를 생성하고 상태를 PROCESSING으로 변경해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({ id: BigInt(5), userId: BigInt(12) });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(5), status: 'PROCESSING' });

      const result = await service.paySandboxPoc(mockAuthContext, 5);

      expect(result.transactionId).toBeDefined();
      expect(result.apiStatus).toBe('PROCESSING');
    });
  });

  // =========================================================================
  // 8. handleWebhook 검증
  // =========================================================================
  describe('handleWebhook', () => {
    const secret = process.env.WEBHOOK_SECRET || 'gachisallim-webhook-secret-key';

    it('5분이 지난 만료된 타임스탬프 요청 시 UnauthorizedException을 던져야 한다', async () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();

      await expect(
        service.handleWebhook('invalid-sig', oldTimestamp, { transactionId: 'TX_1', amount: 5000 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('서명이 올바르지 않으면 UnauthorizedException을 던져야 한다', async () => {
      const nowTimestamp = Date.now().toString();

      await expect(
        service.handleWebhook('wrong-signature', nowTimestamp, { transactionId: 'TX_1', amount: 5000 }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('올바른 서명과 타임스탬프 전달 시 성공적으로 완료 처리해야 한다', async () => {
      const nowTimestamp = Date.now().toString();
      const transactionId = 'TX_VALID_123';
      const amount = 5000;

      const payload = `${nowTimestamp}.${transactionId}.${amount}`;
      const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        transactionId,
        amount,
        status: 'PROCESSING',
      });

      jest.spyOn(service, 'settleSplit').mockResolvedValue({
        message: '성공',
        isAllSettled: true,
        status: 'DONE',
      });

      const result = await service.handleWebhook(validSignature, nowTimestamp, { transactionId, amount });
      expect(result.status).toBe('SUCCESS');
    });
  });

  // =========================================================================
  // 9. settleSplit 검증
  // =========================================================================
  describe('settleSplit', () => {
    it('body가 생략되더라도 기본적으로 DONE 상태로 전이되어야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        expenseId: BigInt(10),
        expense: { payerId: BigInt(12), createdBy: BigInt(12) },
      });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(1), expenseId: BigInt(10), status: 'DONE' });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: BigInt(1), status: 'DONE' },
        { id: BigInt(2), status: 'REQUESTED' },
      ]);

      const result = await service.settleSplit(mockAuthContext, 1);

      expect(result.isAllSettled).toBe(false);
      expect(result.status).toBe('DONE');
    });

    it('전원 정산이 완료된 경우, 부모 Expense 상태를 DONE으로 자동 갱신해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        expenseId: BigInt(10),
        expense: { payerId: BigInt(12), createdBy: BigInt(12) },
      });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(1), expenseId: BigInt(10), status: 'DONE' });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: BigInt(1), status: 'DONE' },
        { id: BigInt(2), status: 'DONE' },
      ]);
      prisma.expense.update = jest.fn().mockResolvedValue({ id: BigInt(10), status: 'DONE' });

      const result = await service.settleSplit(mockAuthContext, 1, { isBulkComplete: true });

      expect(result.isAllSettled).toBe(true);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { status: 'DONE' },
      });
    });
  });

  // =========================================================================
  // 10. shareExpenseCard 검증
  // =========================================================================
  describe('shareExpenseCard', () => {
    it('존재하지 않는 지출 내역이면 COMMON_NOT_FOUND BusinessException을 발생시켜야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue(null);
      await expect(service.shareExpenseCard(mockAuthContext, 999)).rejects.toThrow(
        new BusinessException(ErrorCode.COMMON_NOT_FOUND),
      );
    });

    it('기본 채팅방이 없는 경우 CHAT_ROOM_NOT_FOUND 예외를 던져야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({ id: BigInt(1), groupId: BigInt(5) });
      prisma.chatRoom.findFirst.mockResolvedValue(null);

      await expect(service.shareExpenseCard(mockAuthContext, 1)).rejects.toThrow(
        new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND),
      );
    });

    it('지출 내역이 존재하고 기본 채팅방이 있으면 실제 메시지를 생성하고 PK(messageId)를 반환해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(5),
        title: '테스트 지출',
        totalAmount: 10000,
      });
      prisma.chatRoom.findFirst.mockResolvedValue({ id: BigInt(3) });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ id: BigInt(1) });
      prisma.message.create.mockResolvedValue({ id: BigInt(7001) });

      const result = await service.shareExpenseCard(mockAuthContext, 1);

      expect(result).toEqual({
        expenseId: 1,
        messageId: 7001,
      });
      expect(prisma.message.create).toHaveBeenCalled();
    });
  });
});
})
