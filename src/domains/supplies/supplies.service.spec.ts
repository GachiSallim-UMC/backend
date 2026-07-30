import { Test, TestingModule } from '@nestjs/testing';
import {
  ExpenseCategory,
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
    expense: { create: jest.Mock };
    groupMember: { findUnique: jest.Mock };
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
      expense: { create: jest.fn() },
      groupMember: { findUnique: jest.fn() },
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

  function arrangeHappyPath() {
    tx.supply.findUnique.mockResolvedValue({
      id: SUPPLY_ID,
      groupId: GROUP_ID,
      name: '화장지',
      status: SupplyStatus.LOW,
    });
    tx.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });
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
