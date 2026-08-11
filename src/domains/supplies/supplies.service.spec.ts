import { Test, TestingModule } from '@nestjs/testing';
import {
  ExpenseCategory,
  ExpenseSplitStatus,
  ExpenseStatus,
  Prisma,
  SplitType,
  SupplyCategory,
  SupplyStatus,
} from '@prisma/client';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliesService } from './supplies.service';
import { SupplyUsersService } from './supply-users.service';

describe('SuppliesService', () => {
  const COGNITO_SUB = 'cognito-sub-1';
  const USER_ID = BigInt(5);
  const SUPPLY_ID = BigInt(21);
  const GROUP_ID = BigInt(1);

  let service: SuppliesService;
  let tx: {
    supply: { findUnique: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    supplyLog: { create: jest.Mock };
    expense: { create: jest.Mock; update: jest.Mock };
    expenseSplit: { createManyAndReturn: jest.Mock };
    groupMember: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    groupMember: { findUnique: jest.Mock };
    supply: { findUnique: jest.Mock; update: jest.Mock };
  };
  let supplyUsers: { resolveActiveUserId: jest.Mock };

  beforeEach(async () => {
    tx = {
      supply: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      supplyLog: { create: jest.fn() },
      expense: { create: jest.fn(), update: jest.fn() },
      expenseSplit: { createManyAndReturn: jest.fn() },
      groupMember: { findUnique: jest.fn(), findMany: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
      groupMember: { findUnique: jest.fn() },
      supply: { findUnique: jest.fn(), update: jest.fn() },
    };

    supplyUsers = { resolveActiveUserId: jest.fn().mockResolvedValue(USER_ID) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupplyUsersService, useValue: supplyUsers },
      ],
    }).compile();

    service = module.get(SuppliesService);
  });

  function arrangeHappyPath(memberIds: bigint[] = [USER_ID, BigInt(6), BigInt(7)]) {
    tx.supply.findUnique.mockResolvedValue({
      id: SUPPLY_ID,
      groupId: GROUP_ID,
      name: '화장지',
      status: SupplyStatus.LOW,
    });
    tx.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });
    tx.groupMember.findMany.mockResolvedValue(memberIds.map((userId) => ({ userId })));
    // createManyAndReturn은 INSERT ... RETURNING이라 전달한 data 순서 그대로 id가 붙어 돌아온다.
    tx.expenseSplit.createManyAndReturn.mockImplementation(
      ({ data }: { data: Array<{ userId: bigint; amount: number; status: ExpenseSplitStatus }> }) =>
        Promise.resolve(
          data.map((split, index) => ({ id: BigInt(301 + index), ...split, expenseId: undefined })),
        ),
    );
    tx.expense.update.mockResolvedValue({});
    tx.expense.create.mockResolvedValue({
      id: BigInt(88),
      category: ExpenseCategory.SHOPPING,
      title: '화장지',
      payerId: USER_ID,
      totalAmount: 8900,
      splitType: SplitType.EQUAL,
      status: ExpenseStatus.PENDING,
    });
    tx.supply.updateMany.mockResolvedValue({ count: 1 });
    tx.supplyLog.create.mockResolvedValue({});
    tx.supply.findUniqueOrThrow.mockResolvedValue({
      id: SUPPLY_ID,
      status: SupplyStatus.PURCHASED,
      linkedExpenseId: BigInt(88),
      updatedAt: new Date('2026-07-03T14:00:00Z'),
    });
  }

  describe('purchase', () => {
    it('category가 없으면 SUP_400_CATEGORY 예외를 던진다', async () => {
      await expect(service.purchase(SUPPLY_ID, { amount: 8900 }, COGNITO_SUB)).rejects.toThrow(
        BusinessException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('amount가 없으면 400 예외를 던진다', async () => {
      await expect(
        service.purchase(SUPPLY_ID, { category: ExpenseCategory.SHOPPING }, COGNITO_SUB),
      ).rejects.toThrow(BusinessException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('구매 완료 시 전달받은 category로 Expense를 생성한다', async () => {
      arrangeHappyPath();

      await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 8900 },
        COGNITO_SUB,
      );

      const createCalls = tx.expense.create.mock.calls as [{ data: Record<string, unknown> }][];
      const data = createCalls[0][0].data;

      expect(data.category).toBe(ExpenseCategory.SHOPPING);
      expect(data.totalAmount).toBe(8900);
      // 회귀 방지: Expense 스키마에 categoryId 필드는 존재하지 않는다.
      expect(data).not.toHaveProperty('categoryId');
    });

    it('응답의 expense에 categoryId가 아닌 category가 담긴다', async () => {
      arrangeHappyPath();

      const result = await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 8900 },
        COGNITO_SUB,
      );

      expect(result.expense.category).toBe(ExpenseCategory.SHOPPING);
      expect(result.expense).not.toHaveProperty('categoryId');
      expect(result.status).toBe(SupplyStatus.PURCHASED);
      expect(result.linkedExpenseId).toBe(88);
    });

    it('활성 그룹 멤버 전원에 대해 ExpenseSplit을 생성한다 (#222)', async () => {
      arrangeHappyPath();

      await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 9000 },
        COGNITO_SUB,
      );

      expect(tx.groupMember.findMany).toHaveBeenCalledWith({
        where: { groupId: GROUP_ID, leftAt: null, user: { isActive: true } },
        select: { userId: true },
        orderBy: { userId: 'asc' },
      });

      const createManyCalls = tx.expenseSplit.createManyAndReturn.mock.calls as [
        { data: Array<{ expenseId: bigint; userId: bigint; amount: number; status: string }> },
      ][];
      const data = createManyCalls[0][0].data;

      expect(data).toHaveLength(3);
      expect(data.map((split) => split.userId)).toEqual([USER_ID, BigInt(6), BigInt(7)]);
      expect(data.every((split) => split.expenseId === BigInt(88))).toBe(true);
      expect(data.map((split) => split.amount)).toEqual([3000, 3000, 3000]);
    });

    it('나머지 금액을 앞에서부터 1원씩 배분한다 (#222)', async () => {
      arrangeHappyPath();

      await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 8900 },
        COGNITO_SUB,
      );

      const createManyCalls = tx.expenseSplit.createManyAndReturn.mock.calls as [
        { data: Array<{ amount: number }> },
      ][];
      const amounts = createManyCalls[0][0].data.map((split) => split.amount);

      // 8900 / 3 = 2966 나머지 2 → 앞의 두 명이 1원씩 더 부담
      expect(amounts).toEqual([2967, 2967, 2966]);
      expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(8900);
    });

    it('선지불자는 PRE_PAID, 나머지는 REQUESTED 상태로 생성한다 (#222)', async () => {
      arrangeHappyPath();

      await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 9000 },
        COGNITO_SUB,
      );

      const createManyCalls = tx.expenseSplit.createManyAndReturn.mock.calls as [
        { data: Array<{ userId: bigint; status: ExpenseSplitStatus }> },
      ][];
      const byUserId = new Map(
        createManyCalls[0][0].data.map((split) => [split.userId, split.status]),
      );

      expect(byUserId.get(USER_ID)).toBe(ExpenseSplitStatus.PRE_PAID);
      expect(byUserId.get(BigInt(6))).toBe(ExpenseSplitStatus.REQUESTED);
      expect(byUserId.get(BigInt(7))).toBe(ExpenseSplitStatus.REQUESTED);
    });

    it('응답의 expense.splits로 생성된 분담 내역을 반환한다 (#222)', async () => {
      arrangeHappyPath();

      const result = await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 9000 },
        COGNITO_SUB,
      );

      expect(result.expense.splits).toEqual([
        { splitId: 301, userId: 5, amount: 3000, status: ExpenseSplitStatus.PRE_PAID },
        { splitId: 302, userId: 6, amount: 3000, status: ExpenseSplitStatus.REQUESTED },
        { splitId: 303, userId: 7, amount: 3000, status: ExpenseSplitStatus.REQUESTED },
      ]);
    });

    it('CAS 실패 시 Split 생성까지 포함해 트랜잭션이 롤백된다 (#222)', async () => {
      arrangeHappyPath();
      tx.supply.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 9000 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      // Split은 CAS 이전에 생성되지만, 예외로 트랜잭션 전체가 롤백되므로 커밋되지 않는다.
      expect(tx.expenseSplit.createManyAndReturn).toHaveBeenCalled();
      expect(tx.supplyLog.create).not.toHaveBeenCalled();
    });

    it('활성 그룹 멤버가 없으면 403 예외를 던진다 (#222)', async () => {
      arrangeHappyPath([]);

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 9000 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.expenseSplit.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.supply.updateMany).not.toHaveBeenCalled();
    });

    it('멤버십 검증 이후 구매자가 활성 구성원에서 빠지면 403으로 롤백한다 (#223 리뷰)', async () => {
      // READ COMMITTED에서는 assertActiveGroupMember 통과 이후 커밋된 탈퇴·강퇴가 findMany에 보인다.
      // 목록이 비어 있지 않아도 구매자가 없으면 선지불자 없는 분담이 만들어지므로 막아야 한다.
      arrangeHappyPath([BigInt(6), BigInt(7)]);

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 9000 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.expenseSplit.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.supply.updateMany).not.toHaveBeenCalled();
      expect(tx.supplyLog.create).not.toHaveBeenCalled();
    });

    it('분담 대상이 구매자뿐이면 Expense를 DONE으로 생성한다 (#223 리뷰)', async () => {
      arrangeHappyPath([USER_ID]);

      const result = await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 9000 },
        COGNITO_SUB,
      );

      expect(tx.expense.update).toHaveBeenCalledWith({
        where: { id: BigInt(88) },
        data: { status: ExpenseStatus.DONE },
      });
      expect(result.expense.status).toBe(ExpenseStatus.DONE);
      expect(result.expense.splits).toEqual([
        { splitId: 301, userId: 5, amount: 9000, status: ExpenseSplitStatus.PRE_PAID },
      ]);
    });

    it('REQUESTED split이 하나라도 있으면 Expense를 PENDING으로 둔다 (#223 리뷰)', async () => {
      arrangeHappyPath();

      const result = await service.purchase(
        SUPPLY_ID,
        { category: ExpenseCategory.SHOPPING, amount: 9000 },
        COGNITO_SUB,
      );

      expect(tx.expense.update).not.toHaveBeenCalled();
      expect(result.expense.status).toBe(ExpenseStatus.PENDING);
    });

    it('이미 구매 완료된 물품이면 409 예외를 던진다', async () => {
      tx.supply.findUnique.mockResolvedValue({
        id: SUPPLY_ID,
        groupId: GROUP_ID,
        name: '화장지',
        status: SupplyStatus.PURCHASED,
      });
      tx.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 8900 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.expense.create).not.toHaveBeenCalled();
    });

    it('동시 요청으로 CAS가 실패하면 409 예외를 던진다', async () => {
      arrangeHappyPath();
      tx.supply.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 8900 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.supplyLog.create).not.toHaveBeenCalled();
    });

    it('그룹 멤버가 아니면 403 예외를 던진다', async () => {
      tx.supply.findUnique.mockResolvedValue({
        id: SUPPLY_ID,
        groupId: GROUP_ID,
        name: '화장지',
        status: SupplyStatus.LOW,
      });
      tx.groupMember.findUnique.mockResolvedValue(null);

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 8900 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.expense.create).not.toHaveBeenCalled();
    });

    it('존재하지 않는 supplyId면 404 예외를 던진다', async () => {
      tx.supply.findUnique.mockResolvedValue(null);

      await expect(
        service.purchase(
          SUPPLY_ID,
          { category: ExpenseCategory.SHOPPING, amount: 8900 },
          COGNITO_SUB,
        ),
      ).rejects.toThrow(BusinessException);

      expect(tx.expense.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSupply', () => {
    const EXISTING = {
      id: SUPPLY_ID,
      groupId: GROUP_ID,
      name: '화장지',
      category: SupplyCategory.DAILY_NECESSITIES,
      status: SupplyStatus.LOW,
      assigneeId: null,
      memo: null,
      linkedExpenseId: null,
      createdBy: USER_ID,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      assignee: null,
      creator: { id: USER_ID, nickname: '도훈' },
    };

    function arrangeUpdate(overrides: Record<string, unknown> = {}) {
      prisma.supply.findUnique.mockResolvedValue(EXISTING);
      prisma.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });
      prisma.supply.update.mockResolvedValue({ ...EXISTING, ...overrides });
    }

    it('전달된 필드만 부분 수정한다', async () => {
      arrangeUpdate({ name: '두루마리 화장지', category: SupplyCategory.BATHROOM });

      const result = await service.updateSupply(
        SUPPLY_ID,
        { name: '두루마리 화장지', category: SupplyCategory.BATHROOM },
        COGNITO_SUB,
      );

      const [args] = prisma.supply.update.mock.calls[0] as [{ data: Record<string, unknown> }];

      expect(args.data).toEqual({ name: '두루마리 화장지', category: SupplyCategory.BATHROOM });
      expect(result.name).toBe('두루마리 화장지');
      expect(result.category).toBe(SupplyCategory.BATHROOM);
    });

    it('status는 수정 대상에 포함되지 않는다 (상태 변경은 /status 담당)', async () => {
      arrangeUpdate();

      await service.updateSupply(SUPPLY_ID, { memo: '대용량으로 구입' }, COGNITO_SUB);

      const [args] = prisma.supply.update.mock.calls[0] as [{ data: Record<string, unknown> }];

      expect(args.data).not.toHaveProperty('status');
      expect(args.data.memo).toBe('대용량으로 구입');
    });

    it('assigneeId가 null이면 담당자를 해제한다', async () => {
      arrangeUpdate();

      await service.updateSupply(SUPPLY_ID, { assigneeId: null }, COGNITO_SUB);

      const [args] = prisma.supply.update.mock.calls[0] as [{ data: Record<string, unknown> }];

      expect(args.data.assignee).toEqual({ disconnect: true });
    });

    it('담당자가 그룹 멤버가 아니면 400 예외를 던진다', async () => {
      prisma.supply.findUnique.mockResolvedValue(EXISTING);
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: BigInt(1), leftAt: null }) // 요청자 멤버십
        .mockResolvedValueOnce(null); // 담당자 멤버십

      await expect(
        service.updateSupply(SUPPLY_ID, { assigneeId: 99 }, COGNITO_SUB),
      ).rejects.toThrow(BusinessException);

      expect(prisma.supply.update).not.toHaveBeenCalled();
    });

    it('수정할 항목이 하나도 없으면 400 예외를 던진다', async () => {
      arrangeUpdate();

      await expect(service.updateSupply(SUPPLY_ID, {}, COGNITO_SUB)).rejects.toThrow(
        BusinessException,
      );

      expect(prisma.supply.update).not.toHaveBeenCalled();
    });

    it('같은 그룹에 동일한 이름이 있으면(P2002) 409 예외를 던진다', async () => {
      prisma.supply.findUnique.mockResolvedValue(EXISTING);
      prisma.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });
      prisma.supply.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.updateSupply(SUPPLY_ID, { name: '샴푸' }, COGNITO_SUB)).rejects.toThrow(
        BusinessException,
      );
    });

    it('존재하지 않는 supplyId면 404 예외를 던진다', async () => {
      prisma.supply.findUnique.mockResolvedValue(null);

      await expect(service.updateSupply(SUPPLY_ID, { name: '샴푸' }, COGNITO_SUB)).rejects.toThrow(
        BusinessException,
      );

      expect(prisma.supply.update).not.toHaveBeenCalled();
    });

    it('그룹 멤버가 아니면 403 예외를 던진다', async () => {
      prisma.supply.findUnique.mockResolvedValue(EXISTING);
      prisma.groupMember.findUnique.mockResolvedValue(null);

      await expect(service.updateSupply(SUPPLY_ID, { name: '샴푸' }, COGNITO_SUB)).rejects.toThrow(
        BusinessException,
      );

      expect(prisma.supply.update).not.toHaveBeenCalled();
    });
  });
});
