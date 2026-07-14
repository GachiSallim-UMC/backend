import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. 비용 등록 및 정산 요청 생성
  async createExpense(createExpenseDto: CreateExpenseDto) {
    const { groupId, categoryId, userId, title, totalAmount, splitType, participants } = createExpenseDto;

    const count = participants.length;
    if (count === 0) {
      throw new BadRequestException('정산 대상 멤버가 최소 1명 이상 필요합니다.');
    }

    const calculatedAmount = Math.ceil(totalAmount / count);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          categoryId,
          payerId: userId,
          createdBy: userId,
          title,
          totalAmount,
          splitType,
        },
      });

      const splitData = participants.map((participantId) => ({
        expenseId: expense.id,
        userId: participantId,
        amount: calculatedAmount,
        isPaid: participantId === userId,
      }));

      await tx.expenseSplit.createMany({
        data: splitData,
      });

      return {
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: expense.id,
      };
    });
  }

  // 2. 특정 그룹의 정산 현황 목록 조회
  async getExpensesByGroup(groupId: number, categoryId?: number, userId?: number) {
    return this.prisma.expense.findMany({
      where: {
        groupId,
        ...(categoryId && { categoryId }),
        ...(userId && { payerId: userId }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // 3. 특정 정산 상세 내역 조회
  async getExpenseDetail(expenseId: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        splits: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('존재하지 않는 정산 내역입니다.');
    }

    return expense;
  }

  // 4. 지출 내역 수정
  async updateExpense(expenseId: number, updateExpenseDto: CreateExpenseDto) {
    return this.prisma.expense.update({
      where: { id: expenseId },
      data: updateExpenseDto,
    });
  }

  // 5. 지출 내역 삭제
  async deleteExpense(expenseId: number) {
    await this.prisma.expense.delete({
      where: { id: expenseId },
    });

    return {
      message: '지출 내역이 성공적으로 삭제되었습니다.',
      deletedExpenseId: expenseId,
    };
  }

  // 6. 개별 정산 상태 변경
  async settleSplit(splitId: number, isBulkComplete: boolean) {
    return this.prisma.expenseSplit.update({
      where: { id: splitId },
      data: {
        status: isBulkComplete ? 'DONE' : 'REQUESTED',
      },
    });
  }
}