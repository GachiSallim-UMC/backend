import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ExpenseSplitStatus } from '@prisma/client';

import { AuthContext } from '../auth/common/auth-context.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { BankAccountResponseDto } from './dto/bank-account-response.dto';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

const UNSETTLED_SPLIT_STATUSES: ExpenseSplitStatus[] = [
  ExpenseSplitStatus.REQUESTED,
  ExpenseSplitStatus.CONFIRMED,
  ExpenseSplitStatus.TRANSFER_PENDING,
  ExpenseSplitStatus.PROCESSING,
  ExpenseSplitStatus.FAILED,
];

@Injectable()
export class BankAccountService {
  constructor(private readonly prisma: PrismaService) {}

  private async getUserIdByAuth(auth: AuthContext): Promise<bigint> {
    const user = await this.prisma.user.findFirst({
      where: {
        authIdentities: {
          some: { cognitoSub: auth.cognitoSub },
        },
      },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException('인증된 사용자 정보를 DB에서 찾을 수 없습니다.');
    }
    return user.id;
  }

  private toResponseDto(account: {
    id: bigint;
    bankName: BankAccountResponseDto['bankName'];
    accountNumber: string;
    isPrimary: boolean;
  }): BankAccountResponseDto {
    return {
      id: Number(account.id),
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      isPrimary: account.isPrimary,
    };
  }

  private async assertOwnedAccount(userId: bigint, bankAccountId: number) {
    const account = await this.prisma.userBankAccount.findUnique({
      where: { id: BigInt(bankAccountId) },
    });

    if (!account) {
      throw new BadRequestException('존재하지 않는 계좌입니다.');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('본인 명의의 계좌만 관리할 수 있습니다.');
    }

    return account;
  }

  async createBankAccount(
    auth: AuthContext,
    dto: CreateBankAccountDto,
  ): Promise<BankAccountResponseDto> {
    const userId = await this.getUserIdByAuth(auth);

    const existingCount = await this.prisma.userBankAccount.count({ where: { userId } });

    const account = await this.prisma.userBankAccount.create({
      data: {
        userId,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        isPrimary: existingCount === 0,
      },
    });

    return this.toResponseDto(account);
  }

  async listBankAccounts(auth: AuthContext): Promise<BankAccountResponseDto[]> {
    const userId = await this.getUserIdByAuth(auth);

    const accounts = await this.prisma.userBankAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return accounts.map((account) => this.toResponseDto(account));
  }

  async setPrimaryBankAccount(
    auth: AuthContext,
    bankAccountId: number,
  ): Promise<BankAccountResponseDto> {
    const userId = await this.getUserIdByAuth(auth);
    await this.assertOwnedAccount(userId, bankAccountId);

    const [, updated] = await this.prisma.$transaction([
      this.prisma.userBankAccount.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.userBankAccount.update({
        where: { id: BigInt(bankAccountId) },
        data: { isPrimary: true },
      }),
    ]);

    return this.toResponseDto(updated);
  }

  async deleteBankAccount(auth: AuthContext, bankAccountId: number): Promise<{ message: string }> {
    const userId = await this.getUserIdByAuth(auth);
    const account = await this.assertOwnedAccount(userId, bankAccountId);

    // 이 계좌가 마지막 남은 계좌일 때만 "주계좌가 없어지는" 위험이 생긴다.
    // 계좌가 더 있으면 다른 계좌가 주계좌로 승격되므로 진행중인 정산에 영향이 없다.
    const totalCount = await this.prisma.userBankAccount.count({ where: { userId } });
    if (totalCount === 1) {
      const unsettledSplit = await this.prisma.expenseSplit.findFirst({
        where: {
          expense: { payerId: userId },
          status: { in: UNSETTLED_SPLIT_STATUSES },
        },
      });

      if (unsettledSplit) {
        throw new BadRequestException(
          '미완료된 정산 내역이 있습니다. 정산 요청을 완료하거나 삭제한 후 계좌를 삭제해주세요.',
        );
      }
    }

    await this.prisma.userBankAccount.delete({ where: { id: BigInt(bankAccountId) } });

    if (account.isPrimary) {
      const nextPrimary = await this.prisma.userBankAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (nextPrimary) {
        await this.prisma.userBankAccount.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: '계좌가 삭제되었습니다.' };
  }
}
