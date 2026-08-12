import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BankAccountService } from './bank-account.service';

describe('BankAccountService', () => {
  const findFirstUser = jest.fn().mockResolvedValue({ id: 7n });
  const count = jest.fn();
  const create = jest.fn();
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const deleteMock = jest.fn();
  const findFirst = jest.fn();
  const findFirstExpenseSplit = jest.fn();
  const transaction = jest.fn((operations: unknown[]) => Promise.all(operations));

  const service = new BankAccountService({
    user: { findFirst: findFirstUser },
    userBankAccount: {
      count,
      create,
      findMany,
      findUnique,
      update,
      updateMany,
      delete: deleteMock,
      findFirst,
    },
    expenseSplit: {
      findFirst: findFirstExpenseSplit,
    },
    $transaction: transaction,
  } as unknown as PrismaService);

  const auth = { cognitoSub: 'cognito-sub', accessToken: 'token' };

  beforeEach(() => {
    jest.clearAllMocks();
    findFirstUser.mockResolvedValue({ id: 7n });
    // 기본값: "마지막 계좌 아님" — deleteBankAccount의 미완료 정산 체크를 건드리지 않는 안전한 기본 상태.
    count.mockResolvedValue(2);
  });

  describe('createBankAccount', () => {
    it('marks the first registered account as primary', async () => {
      count.mockResolvedValue(0);
      create.mockResolvedValue({
        id: 1n,
        bankName: 'SHINHAN',
        accountNumber: '110123456789',
        isPrimary: true,
      });

      const result = await service.createBankAccount(auth, {
        bankName: 'SHINHAN' as never,
        accountNumber: '110123456789',
      });

      expect(create).toHaveBeenCalledWith({
        data: { userId: 7n, bankName: 'SHINHAN', accountNumber: '110123456789', isPrimary: true },
      });
      expect(result.isPrimary).toBe(true);
    });

    it('does not mark a subsequently registered account as primary', async () => {
      count.mockResolvedValue(1);
      create.mockResolvedValue({
        id: 2n,
        bankName: 'KB',
        accountNumber: '9999999999',
        isPrimary: false,
      });

      const result = await service.createBankAccount(auth, {
        bankName: 'KB' as never,
        accountNumber: '9999999999',
      });

      expect(create).toHaveBeenCalledWith({
        data: { userId: 7n, bankName: 'KB', accountNumber: '9999999999', isPrimary: false },
      });
      expect(result.isPrimary).toBe(false);
    });
  });

  describe('listBankAccounts', () => {
    it('returns accounts ordered with the primary account first', async () => {
      findMany.mockResolvedValue([
        { id: 1n, bankName: 'SHINHAN', accountNumber: '110123456789', isPrimary: true },
        { id: 2n, bankName: 'KB', accountNumber: '9999999999', isPrimary: false },
      ]);

      const result = await service.listBankAccounts(auth);

      expect(findMany).toHaveBeenCalledWith({
        where: { userId: 7n },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].isPrimary).toBe(true);
    });
  });

  describe('setPrimaryBankAccount', () => {
    it('rejects switching an account that does not belong to the user', async () => {
      findUnique.mockResolvedValue({ id: 2n, userId: 99n, isPrimary: false });

      await expect(service.setPrimaryBankAccount(auth, 2)).rejects.toThrow(ForbiddenException);
    });

    it('rejects switching to a non-existent account', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.setPrimaryBankAccount(auth, 999)).rejects.toThrow(BadRequestException);
    });

    it('unsets the previous primary account and sets the requested one', async () => {
      findUnique.mockResolvedValue({ id: 2n, userId: 7n, isPrimary: false });
      update.mockResolvedValue({
        id: 2n,
        bankName: 'KB',
        accountNumber: '9999999999',
        isPrimary: true,
      });

      const result = await service.setPrimaryBankAccount(auth, 2);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(result.isPrimary).toBe(true);
    });
  });

  describe('deleteBankAccount', () => {
    it('rejects deleting an account that does not belong to the user', async () => {
      findUnique.mockResolvedValue({ id: 2n, userId: 99n, isPrimary: false });

      await expect(service.deleteBankAccount(auth, 2)).rejects.toThrow(ForbiddenException);
    });

    it('promotes the most recently created remaining account when the primary account is deleted', async () => {
      findUnique.mockResolvedValue({ id: 1n, userId: 7n, isPrimary: true });
      findFirst.mockResolvedValue({ id: 2n });

      await service.deleteBankAccount(auth, 1);

      expect(deleteMock).toHaveBeenCalledWith({ where: { id: 1n } });
      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: 7n },
        orderBy: { createdAt: 'desc' },
      });
      expect(update).toHaveBeenCalledWith({ where: { id: 2n }, data: { isPrimary: true } });
    });

    it('does not promote anything when the deleted account was not primary', async () => {
      findUnique.mockResolvedValue({ id: 2n, userId: 7n, isPrimary: false });

      await service.deleteBankAccount(auth, 2);

      expect(deleteMock).toHaveBeenCalledWith({ where: { id: 2n } });
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('rejects deleting the last remaining account when the user has an unsettled split as payer', async () => {
      findUnique.mockResolvedValue({ id: 1n, userId: 7n, isPrimary: true });
      count.mockResolvedValue(1);
      findFirstExpenseSplit.mockResolvedValue({ id: 10n });

      await expect(service.deleteBankAccount(auth, 1)).rejects.toThrow(
        '미완료된 정산 내역이 있습니다. 정산 요청을 완료하거나 삭제한 후 계좌를 삭제해주세요.',
      );
      expect(findFirstExpenseSplit).toHaveBeenCalledWith({
        where: {
          expense: { payerId: 7n },
          status: { in: ['REQUESTED', 'CONFIRMED', 'TRANSFER_PENDING', 'PROCESSING', 'FAILED'] },
        },
      });
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('allows deleting the last remaining account when there is no unsettled split', async () => {
      findUnique.mockResolvedValue({ id: 1n, userId: 7n, isPrimary: true });
      count.mockResolvedValue(1);
      findFirstExpenseSplit.mockResolvedValue(null);

      await service.deleteBankAccount(auth, 1);

      expect(deleteMock).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it('does not check for unsettled splits when other accounts remain', async () => {
      findUnique.mockResolvedValue({ id: 2n, userId: 7n, isPrimary: false });
      count.mockResolvedValue(2);

      await service.deleteBankAccount(auth, 2);

      expect(findFirstExpenseSplit).not.toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalledWith({ where: { id: 2n } });
    });
  });
});
