/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseNotFoundException } from './expenses.exception';
import { ReceiptImageService } from './receipt-image.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AuthContext } from '../auth/common/auth-context.interface';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { ExpenseCategory, SplitType, ExpenseSplitStatus, GroupRole } from '@prisma/client';
import * as crypto from 'crypto';

const mockPrismaService = (): any => {
  const mockUserRepo = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
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

  const mockUserBankAccountRepo = {
    findFirst: jest.fn(),
  };

  const serviceMock: any = {
    user: mockUserRepo,
    groupMember: mockGroupMemberRepo,
    expense: mockExpenseRepo,
    expenseSplit: mockExpenseSplitRepo,
    chatRoom: mockChatRoomRepo,
    chatRoomMember: mockChatRoomMemberRepo,
    message: mockMessageRepo,
    userBankAccount: mockUserBankAccountRepo,
  };

  serviceMock.$transaction = jest.fn((callback: (tx: any) => any) => callback(serviceMock));

  return serviceMock;
};

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: any;
  let receiptImages: {
    assertReceiptKeyBelongsToGroup: jest.Mock;
    assertObjectExists: jest.Mock;
    deleteObject: jest.Mock;
  };
  let notificationDelivery: { createNotification: jest.Mock };

  const mockAuthContext: AuthContext = {
    cognitoSub: 'test-cognito-sub-123',
    accessToken: 'mock-access-token',
  };

  beforeEach(async () => {
    receiptImages = {
      assertReceiptKeyBelongsToGroup: jest.fn(),
      assertObjectExists: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    notificationDelivery = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: PrismaService,
          useFactory: mockPrismaService,
        },
        {
          provide: ReceiptImageService,
          useValue: receiptImages,
        },
        {
          provide: NotificationDeliveryService,
          useValue: notificationDelivery,
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    prisma = module.get<PrismaService>(PrismaService);

    prisma.user.findFirst.mockResolvedValue({ id: BigInt(12) });
    prisma.groupMember.findFirst.mockResolvedValue({
      id: BigInt(1),
      groupId: BigInt(1),
      userId: BigInt(12),
      role: GroupRole.MEMBER,
    });
    prisma.userBankAccount.findFirst.mockResolvedValue({
      id: BigInt(1),
      bankName: 'SHINHAN',
      accountNumber: '110123456789',
      isPrimary: true,
    });
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
      const groupMembershipCallArgs = prisma.groupMember.findMany.mock.calls[0][0] as {
        where: { leftAt: null | Date };
      };
      expect(groupMembershipCallArgs.where.leftAt).toBeNull();
    });

    it('선지불자(payer)에게 등록된 계좌가 없으면 BadRequestException을 던져야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '점심 식대',
        amount: 10000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [{ userId: '12' }, { userId: '2' }],
      };

      prisma.user.findMany.mockResolvedValue([{ id: BigInt(12) }, { id: BigInt(2) }]);
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: BigInt(12) },
        { userId: BigInt(2) },
      ]);
      prisma.userBankAccount.findFirst.mockResolvedValue(null);

      await expect(service.createExpense(mockAuthContext, dto)).rejects.toThrow(
        '등록된 계좌가 없습니다. 계좌 등록 먼저 진행해주세요.',
      );
      expect(prisma.userBankAccount.findFirst).toHaveBeenCalledWith({
        where: { userId: BigInt(12), isPrimary: true },
      });
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('receiptUrl이 전달되면 지출이 속한 그룹 소속인지 검증해야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '점심 식대',
        amount: 10000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [{ userId: '12' }],
        receiptUrl: 'develop/receipts/1/12/uuid.jpg',
      };

      prisma.user.findMany.mockResolvedValue([{ id: BigInt(12) }]);
      prisma.groupMember.findMany.mockResolvedValue([{ userId: BigInt(12) }]);
      prisma.expense.create.mockResolvedValue({ id: BigInt(100) });
      prisma.expenseSplit.createMany.mockResolvedValue({ count: 1 });

      await service.createExpense(mockAuthContext, dto);

      expect(receiptImages.assertReceiptKeyBelongsToGroup).toHaveBeenCalledWith(
        1n,
        'develop/receipts/1/12/uuid.jpg',
      );
      expect(receiptImages.assertObjectExists).toHaveBeenCalledWith(
        'develop/receipts/1/12/uuid.jpg',
      );
    });

    it('receiptUrl이 다른 그룹 소속이면 검증 단계에서 예외가 전파되어야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '점심 식대',
        amount: 10000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [{ userId: '12' }],
        receiptUrl: 'develop/receipts/2/12/uuid.jpg',
      };

      prisma.user.findMany.mockResolvedValue([{ id: BigInt(12) }]);
      prisma.groupMember.findMany.mockResolvedValue([{ userId: BigInt(12) }]);
      receiptImages.assertReceiptKeyBelongsToGroup.mockImplementationOnce(() => {
        throw new BadRequestException('영수증 이미지가 해당 그룹에 속하지 않습니다.');
      });

      await expect(service.createExpense(mockAuthContext, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('receiptUrl에 해당하는 오브젝트가 실제로 업로드되지 않았으면 예외가 전파되어야 한다', async () => {
      const dto: CreateExpenseDto = {
        groupId: 1,
        category: ExpenseCategory.FOOD,
        payerId: '12',
        date: '2026-07-23',
        title: '점심 식대',
        amount: 10000,
        splitType: SplitType.EQUAL,
        targetMemberIds: [{ userId: '12' }],
        receiptUrl: 'develop/receipts/1/12/uuid.jpg',
      };

      prisma.user.findMany.mockResolvedValue([{ id: BigInt(12) }]);
      prisma.groupMember.findMany.mockResolvedValue([{ userId: BigInt(12) }]);
      receiptImages.assertObjectExists.mockRejectedValueOnce(
        new BadRequestException('업로드가 완료되지 않은 영수증 이미지입니다.'),
      );

      await expect(service.createExpense(mockAuthContext, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.expense.create).not.toHaveBeenCalled();
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
  // 1-1. getExpensesByGroup 검증
  // =========================================================================
  describe('getExpensesByGroup', () => {
    it('목록 조회 시 각 지출의 splits(참여자 포함)를 함께 반환해야 한다', async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      await service.getExpensesByGroup(1, undefined, undefined);

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { splits: { include: { user: true } } },
        }),
      );
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
      expect(prisma.groupMember.findFirst).toHaveBeenCalledWith({
        where: { groupId: BigInt(1), userId: BigInt(12), leftAt: null },
      });
    });

    it('탈퇴한 멤버(leftAt이 존재)의 조회 요청은 ForbiddenException을 던져야 한다', async () => {
      // leftAt 필터로 인해 findFirst가 탈퇴한 멤버십을 결과에서 제외한 것을 시뮬레이션한다.
      prisma.expense.findUnique.mockResolvedValue({ id: BigInt(1), groupId: BigInt(1) });
      prisma.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.getExpenseDetail(mockAuthContext, 1)).rejects.toThrow(ForbiddenException);
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

    it('receiptUrl 수정 시 기존 지출이 속한 그룹 소속인지 검증해야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        groupId: 5n,
        totalAmount: 30000,
        splitType: SplitType.EQUAL,
        splits: [],
      } as any);
      jest.spyOn(prisma.expense, 'update').mockResolvedValue({ id: 1n } as any);

      await service.updateExpense(mockAuthContext, 1, {
        receiptUrl: 'develop/receipts/5/12/uuid.jpg',
      });

      expect(receiptImages.assertReceiptKeyBelongsToGroup).toHaveBeenCalledWith(
        5n,
        'develop/receipts/5/12/uuid.jpg',
      );
      expect(receiptImages.assertObjectExists).toHaveBeenCalledWith(
        'develop/receipts/5/12/uuid.jpg',
      );
    });

    it('receiptUrl이 다른 그룹 소속이면 검증 단계에서 예외가 전파되어야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        groupId: 5n,
        totalAmount: 30000,
        splitType: SplitType.EQUAL,
        splits: [],
      } as any);
      receiptImages.assertReceiptKeyBelongsToGroup.mockImplementationOnce(() => {
        throw new BadRequestException('영수증 이미지가 해당 그룹에 속하지 않습니다.');
      });

      await expect(
        service.updateExpense(mockAuthContext, 1, {
          receiptUrl: 'develop/receipts/9/12/uuid.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('receiptUrl이 새 값으로 교체되면 기존 영수증 오브젝트를 정리해야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        groupId: 5n,
        totalAmount: 30000,
        splitType: SplitType.EQUAL,
        receiptUrl: 'develop/receipts/5/12/old-uuid.jpg',
        splits: [],
      } as any);
      jest.spyOn(prisma.expense, 'update').mockResolvedValue({ id: 1n } as any);

      await service.updateExpense(mockAuthContext, 1, {
        receiptUrl: 'develop/receipts/5/12/new-uuid.jpg',
      });

      expect(receiptImages.deleteObject).toHaveBeenCalledWith(
        'develop/receipts/5/12/old-uuid.jpg',
      );
    });

    it('receiptUrl을 전달하지 않으면 기존 영수증 오브젝트를 정리하지 않아야 한다', async () => {
      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue({
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        groupId: 5n,
        totalAmount: 30000,
        splitType: SplitType.EQUAL,
        receiptUrl: 'develop/receipts/5/12/old-uuid.jpg',
        splits: [],
      } as any);
      jest.spyOn(prisma.expense, 'update').mockResolvedValue({ id: 1n } as any);

      await service.updateExpense(mockAuthContext, 1, { title: '제목만 수정' });

      expect(receiptImages.deleteObject).not.toHaveBeenCalled();
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

      await service.updateExpense(mockAuthContext, 1, updateDto);

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

    it('targetMemberIds가 전달되면 기존 splits를 삭제하고 새로 지정된 금액으로 생성해야 한다 (CUSTOM)', async () => {
      const mockExistingExpense = {
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        totalAmount: 50000,
        splitType: SplitType.CUSTOM,
        splits: [
          { id: 101n, userId: 12n, amount: 30000, status: ExpenseSplitStatus.PRE_PAID },
          { id: 102n, userId: 2n, amount: 20000, status: ExpenseSplitStatus.REQUESTED },
        ],
      };

      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(mockExistingExpense as any);

      const mockUpdate = jest.fn().mockResolvedValue({ ...mockExistingExpense, totalAmount: 70000 });
      const mockDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
      const mockCreateMany = jest.fn().mockResolvedValue({ count: 2 });

      jest.spyOn(prisma, '$transaction').mockImplementation((callback: any) => {
        return callback({
          expense: { update: mockUpdate },
          expenseSplit: {
            deleteMany: mockDeleteMany,
            createMany: mockCreateMany,
          },
        });
      });

      const updateDto = {
        totalAmount: 70000,
        splitType: SplitType.CUSTOM,
        targetMemberIds: [
          { userId: '12', amount: 40000 },
          { userId: '2', amount: 30000 },
        ],
      };

      await service.updateExpense(mockAuthContext, 1, updateDto);

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { expenseId: 1n },
      });

      const createManyCall = mockCreateMany.mock.calls[0][0] as {
        data: Array<{
          expenseId: bigint;
          userId: bigint;
          amount: number;
          status: ExpenseSplitStatus;
        }>;
      };

      expect(createManyCall.data).toHaveLength(2);
      expect(createManyCall.data[0]).toEqual({
        expenseId: 1n,
        userId: 12n,
        amount: 40000,
        status: ExpenseSplitStatus.PRE_PAID,
      });
      expect(createManyCall.data[1]).toEqual({
        expenseId: 1n,
        userId: 2n,
        amount: 30000,
        status: ExpenseSplitStatus.REQUESTED,
      });
    });

    it('targetMemberIds와 함께 RATIO 방식이 전달되면 percentage 기반으로 금액을 계산하여 새로 생성해야 한다', async () => {
      const mockExistingExpense = {
        id: 1n,
        createdBy: 12n,
        payerId: 12n,
        totalAmount: 100000,
        splitType: SplitType.RATIO,
        splits: [
          { id: 101n, userId: 12n, amount: 50000, status: ExpenseSplitStatus.PRE_PAID },
          { id: 102n, userId: 2n, amount: 50000, status: ExpenseSplitStatus.REQUESTED },
        ],
      };

      jest.spyOn(prisma.expense, 'findUnique').mockResolvedValue(mockExistingExpense as any);

      const mockUpdate = jest.fn().mockResolvedValue({ ...mockExistingExpense, totalAmount: 200000 });
      const mockDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
      const mockCreateMany = jest.fn().mockResolvedValue({ count: 2 });

      jest.spyOn(prisma, '$transaction').mockImplementation((callback: any) => {
        return callback({
          expense: { update: mockUpdate },
          expenseSplit: {
            deleteMany: mockDeleteMany,
            createMany: mockCreateMany,
          },
        });
      });

      const updateDto = {
        totalAmount: 200000,
        splitType: SplitType.RATIO,
        targetMemberIds: [
          { userId: '12', percentage: 70 },
          { userId: '2', percentage: 30 },
        ],
      };

      await service.updateExpense(mockAuthContext, 1, updateDto);

      const createManyCall = mockCreateMany.mock.calls[0][0] as {
        data: Array<{
          expenseId: bigint;
          userId: bigint;
          amount: number;
          status: ExpenseSplitStatus;
        }>;
      };

      expect(createManyCall.data[0].amount).toBe(140000);
      expect(createManyCall.data[1].amount).toBe(60000);
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
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        createdBy: BigInt(12),
      });
      prisma.expense.delete.mockResolvedValue({ id: BigInt(1) });

      const result = await service.deleteExpense(mockAuthContext, 1);
      expect(result).toEqual({
        message: '지출 내역이 성공적으로 삭제되었습니다.',
        deletedExpenseId: 1,
      });
      expect(receiptImages.deleteObject).not.toHaveBeenCalled();
    });

    it('그룹 관리자는 다른 사용자가 작성한 지출 내역을 삭제할 수 있어야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        createdBy: BigInt(99),
      });
      prisma.groupMember.findFirst.mockResolvedValue({ role: GroupRole.ADMIN });
      prisma.expense.delete.mockResolvedValue({ id: BigInt(1) });

      await expect(service.deleteExpense(mockAuthContext, 1)).resolves.toMatchObject({
        deletedExpenseId: 1,
      });
    });

    it('일반 그룹 구성원은 다른 사용자가 작성한 지출 내역을 삭제할 수 없어야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        createdBy: BigInt(99),
      });
      prisma.groupMember.findFirst.mockResolvedValue({ role: GroupRole.MEMBER });

      await expect(service.deleteExpense(mockAuthContext, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });

    it('탈퇴한 그룹 관리자는 다른 사용자가 작성한 지출 내역을 삭제할 수 없어야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        createdBy: BigInt(99),
      });
      prisma.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.deleteExpense(mockAuthContext, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });

    it('영수증 이미지가 첨부된 지출을 삭제하면 해당 S3 오브젝트도 정리해야 한다', async () => {
      prisma.expense.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        createdBy: BigInt(12),
        receiptUrl: 'develop/receipts/5/12/uuid.jpg',
      });
      prisma.expense.delete.mockResolvedValue({ id: BigInt(1) });

      await service.deleteExpense(mockAuthContext, 1);

      expect(receiptImages.deleteObject).toHaveBeenCalledWith('develop/receipts/5/12/uuid.jpg');
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

    it.each([
      ['DONE', '이미 정산이 완료된 내역입니다.'],
      ['PRE_PAID', '이미 정산이 완료된 내역입니다.'],
      ['CANCELLED', '취소된 정산 내역입니다.'],
    ])('분담 상태가 %s이면 "%s" 메시지로 BadRequestException을 던져야 한다', async (status, message) => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        status,
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });

      await expect(service.createPayLink(mockAuthContext, 1)).rejects.toThrow(message);
    });

    it('TRANSFER_PENDING 상태여도(재시도) 딥링크를 다시 발급해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        status: 'TRANSFER_PENDING',
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });
      prisma.userBankAccount = {
        findFirst: jest.fn().mockResolvedValue({
          bankName: 'SHINHAN',
          accountNumber: '110123456789',
          isPrimary: true,
        }),
      };

      const result = await service.createPayLink(mockAuthContext, 1);

      expect(result.deepLinkUrl).toContain(
        'supertoss://send?bank=%EC%8B%A0%ED%95%9C&accountNo=110123456789&amount=5000',
      );
    });

    it('딥링크 발급만으로는 분담 상태를 바꾸거나 알림을 보내지 않아야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });
      prisma.userBankAccount = {
        findFirst: jest.fn().mockResolvedValue({
          bankName: 'SHINHAN',
          accountNumber: '110123456789',
          isPrimary: true,
        }),
      };

      const result = await service.createPayLink(mockAuthContext, 1);

      expect(result).toEqual({
        deepLinkUrl:
          'supertoss://send?bank=%EC%8B%A0%ED%95%9C&accountNo=110123456789&amount=5000',
      });
      expect(prisma.expenseSplit.update).not.toHaveBeenCalled();
      expect(notificationDelivery.createNotification).not.toHaveBeenCalled();
    });

    it('결제 상대방이 정산 수령용 계좌를 등록하지 않았으면 BadRequestException을 던져야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        expense: { payerId: BigInt(99) },
      });
      prisma.userBankAccount = { findFirst: jest.fn().mockResolvedValue(null) };

      await expect(service.createPayLink(mockAuthContext, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 6-1. claimTransfer 검증
  // =========================================================================
  describe('claimTransfer', () => {
    it('분담 내역이 존재하지 않으면 BadRequestException을 발생시켜야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue(null);
      await expect(service.claimTransfer(mockAuthContext, 999)).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['DONE', '이미 정산이 완료된 내역입니다.'],
      ['PRE_PAID', '이미 정산이 완료된 내역입니다.'],
      ['TRANSFER_PENDING', '이미 송금 절차가 진행 중인 내역입니다.'],
      ['PROCESSING', '이미 송금 절차가 진행 중인 내역입니다.'],
      ['CANCELLED', '취소된 정산 내역입니다.'],
    ])('분담 상태가 %s이면 "%s" 메시지로 BadRequestException을 던져야 한다', async (status, message) => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        status,
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });

      await expect(service.claimTransfer(mockAuthContext, 1)).rejects.toThrow(message);
    });

    it('본인의 분담금이 아니면 ForbiddenException을 던져야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(999),
        amount: 5000,
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });

      await expect(service.claimTransfer(mockAuthContext, 1)).rejects.toThrow(ForbiddenException);
    });

    it('분담 상태를 TRANSFER_PENDING으로 바꾸고 결제 상대방에게 알림을 보내야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        amount: 5000,
        expense: { payerId: BigInt(99), groupId: BigInt(1) },
      });
      const updatedAt = new Date('2026-08-11T00:00:00.000Z');
      prisma.expenseSplit.update.mockResolvedValue({
        id: BigInt(1),
        status: 'TRANSFER_PENDING',
        updatedAt,
      });
      prisma.user.findUnique.mockResolvedValue({ nickname: '테스터' });

      const result = await service.claimTransfer(mockAuthContext, 1);

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { status: 'TRANSFER_PENDING' },
      });
      expect(result.status).toBe('TRANSFER_PENDING');
      expect(notificationDelivery.createNotification).toHaveBeenCalledWith({
        userId: BigInt(99),
        groupId: BigInt(1),
        type: 'EXPENSE_TRANSFER_CLAIMED',
        refId: BigInt(1),
        message: '테스터님이 송금완료 표시를 했습니다. 확인하고 승인해주세요.',
        dedupeKey: `expense-split:1:transfer-claimed:${updatedAt.toISOString()}`,
      });
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
    const secret = 'test-only-webhook-secret';

    it('webhookSecret이 전달되지 않으면 InternalServerErrorException을 던져야 한다', async () => {
      const nowTimestamp = Date.now().toString();

      await expect(
        service.handleWebhook('any-sig', nowTimestamp, { transactionId: 'TX_1', amount: 5000 }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('5분이 지난 만료된 타임스탬프 요청 시 UnauthorizedException을 던져야 한다', async () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();

      await expect(
        service.handleWebhook('invalid-sig', oldTimestamp, { transactionId: 'TX_1', amount: 5000 }, secret),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('서명이 올바르지 않으면 UnauthorizedException을 던져야 한다', async () => {
      const nowTimestamp = Date.now().toString();

      await expect(
        service.handleWebhook('wrong-signature', nowTimestamp, { transactionId: 'TX_1', amount: 5000 }, secret),
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

      const result = await service.handleWebhook(validSignature, nowTimestamp, { transactionId, amount }, secret);
      expect(result.status).toBe('SUCCESS');
    });
  });

  // =========================================================================
  // 9. settleSplit 검증
  // =========================================================================
  describe('settleSplit', () => {
    it('body가 생략되더라도 대상 split은 DONE 상태로 전이되어야 한다', async () => {
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
      prisma.expense.update.mockResolvedValue({ id: BigInt(10), status: 'PARTIAL' });

      const result = await service.settleSplit(mockAuthContext, 1);

      expect(prisma.expenseSplit.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { status: 'DONE', completedAt: expect.any(Date) as Date },
      });
      expect(result.status).toBe('DONE');
      expect(result.isAllSettled).toBe(false);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { status: 'PARTIAL' },
      });
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

      const result = await service.settleSplit(mockAuthContext, 1);

      expect(result.isAllSettled).toBe(true);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { status: 'DONE' },
      });
    });

    it('선지불자(PRE_PAID)가 포함된 경우에도 나머지가 DONE이면 부모 Expense 상태를 DONE으로 갱신해야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        expenseId: BigInt(10),
        expense: { payerId: BigInt(12), createdBy: BigInt(12) },
      });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(1), expenseId: BigInt(10), status: 'DONE' });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: BigInt(1), status: 'DONE' },
        { id: BigInt(2), status: 'PRE_PAID' },
      ]);
      prisma.expense.update = jest.fn().mockResolvedValue({ id: BigInt(10), status: 'DONE' });

      const result = await service.settleSplit(mockAuthContext, 1, { isBulkComplete: true });

      expect(result.isAllSettled).toBe(true);
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { status: 'DONE' },
      });
    });

    it('완료 처리를 철회(isBulkComplete: false)하면 부모 Expense 상태도 PARTIAL로 되돌아가야 한다', async () => {
      prisma.expenseSplit.findUnique.mockResolvedValue({
        id: BigInt(1),
        userId: BigInt(12),
        expenseId: BigInt(10),
        expense: { payerId: BigInt(12), createdBy: BigInt(12) },
      });
      prisma.expenseSplit.update.mockResolvedValue({ id: BigInt(1), expenseId: BigInt(10), status: 'REQUESTED' });
      prisma.expenseSplit.findMany.mockResolvedValue([
        { id: BigInt(1), status: 'REQUESTED' },
        { id: BigInt(2), status: 'PRE_PAID' },
      ]);
      prisma.expense.update = jest.fn().mockResolvedValue({ id: BigInt(10), status: 'PARTIAL' });

      const result = await service.settleSplit(mockAuthContext, 1, { isBulkComplete: false });

      expect(result.isAllSettled).toBe(false);
      expect(result.status).toBe('REQUESTED');
      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: { status: 'PARTIAL' },
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
