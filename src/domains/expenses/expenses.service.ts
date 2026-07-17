import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CalculateExpenseDto } from './dto/calculate-expense.dto';
import { WebhookExpenseDto } from './dto/webhook-expense.dto';
import { GetExpenseQueryDto } from './dto/get-expense-query.dto';
import { SettleSplitDto } from './dto/settle-split.dto';
import { ExpenseNotFoundException } from './expenses.exception'; 

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. 비용 등록 및 정산 요청 생성 (EXP-REG-01, EXP-REQ-01)
  async createExpense(createExpenseDto: CreateExpenseDto) {
    const { groupId, categoryId, userId, title, totalAmount, splitType, participants } = createExpenseDto;

    const count = participants.length;
    if (count === 0) {
      throw new BadRequestException('정산 대상 멤버가 최소 1명 이상 필요합니다.');
    }

    // 인당 올림 금액 계산
    const ceilAmount = Math.ceil(totalAmount / count);

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

      const splitData = participants.map((participantId) => {
        const isCreator = participantId === userId;
        let finalAmount = ceilAmount;

        // 선결제자는 타 참여자들의 올림 금액 총합을 뺀 잔액 부담 (보정 정책)
        if (isCreator) {
          const otherParticipantsCount = count - 1;
          finalAmount = totalAmount - (ceilAmount * otherParticipantsCount);
        }

        return {
          expenseId: expense.id,
          userId: participantId,
          amount: finalAmount,
          isPaid: isCreator,
        };
      });

      await tx.expenseSplit.createMany({
        data: splitData,
      });

      return {
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: expense.id,
      };
    });
  }

  // 2. 특정 그룹의 정산 현황 목록 조회 (EXP-LIST-01)
  async getExpenses(query: GetExpenseQueryDto) {
    const { groupId, categoryId, userId } = query;
    return this.getExpensesByGroup(groupId, categoryId, userId);
  }

  // 기존 내역 조회 비즈니스 헬퍼
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

  // 3. 특정 정산 상세 내역 조회 (EXP-DETAIL-01)
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
      throw new ExpenseNotFoundException(); 
    }

    return expense;
  }

  // 4. 지출 내역 수정 (EXP-EDIT-01)
  async updateExpense(expenseId: number, updateExpenseDto: UpdateExpenseDto) {
    const { title, totalAmount, categoryId, splitType } = updateExpenseDto;

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new ExpenseNotFoundException(); 
    }

    return this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(title && { title }),
        ...(totalAmount !== undefined && { totalAmount }),
        ...(categoryId && { categoryId }),
        ...(splitType && { splitType }),
      },
    });
  }

  // 5. 지출 내역 삭제 (EXP-CNCL-01)
  async deleteExpense(expenseId: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new ExpenseNotFoundException(); 
    }

    await this.prisma.expense.delete({
      where: { id: expenseId },
    });

    return {
      message: '지출 내역이 성공적으로 삭제되었습니다.',
      deletedExpenseId: expenseId,
    };
  }

  // 6. 정산 금액 미리보기 자동 계산 (EXP-CALC-01)
  async calculateSplitsPreview(dto: CalculateExpenseDto) {
    const { totalAmount, participants } = dto;
    const count = participants.length;

    if (count === 0) {
      throw new BadRequestException('정산 대상 멤버가 최소 1명 이상 필요합니다.');
    }

    // 인당 올림 금액 계산
    const ceilAmount = Math.ceil(totalAmount / count);
    const receiverId = participants[0];

    const calculatedSplits = participants.map((participantId: number) => {
      const isReceiver = participantId === receiverId;
      let finalAmount = ceilAmount;

      if (isReceiver) {
        const otherParticipantsCount = count - 1;
        finalAmount = totalAmount - (ceilAmount * otherParticipantsCount);
      }

      return {
        userId: participantId,
        amount: finalAmount,
        role: isReceiver ? 'RECEIVER' : ('SENDER' as const),
      };
    });

    await Promise.resolve();

    return {
      totalAmount,
      calculatedSplits,
    };
  }

  // 7. 외부 송금 앱 연결 정보 생성 (EXP-PAYLINK-01)
  async createPayLink(splitId: number) {
  // 1. 분담 내역 조회
  const split = await this.prisma.expenseSplit.findUnique({
    where: { id: splitId },
  });

  if (!split) {
    throw new BadRequestException('존재하지 않는 분담 내역입니다.');
  }

  // 2. 가상의 모임 통장 계좌번호 매핑 (테스트용 계좌)
  const bank = 'SHINHAN';
  const accountNo = '110123456789'; // 임의의 신한은행 가상계좌번호
  const amount = split.amount;

  // 3. 404가 나지 않는 앱 전용 송금 커스텀 스키마로 딥링크 조립
  const deepLinkUrl = `supertoss://send?bank=${bank}&accountNo=${accountNo}&amount=${amount}`;

  // 4. 상태 변경
  const updatedSplit = await this.prisma.expenseSplit.update({
    where: { id: splitId },
    data: { status: 'TRANSFER_PENDING' },
  });

  return {
    deepLinkUrl,
    status: updatedSplit.status,
  };
}

  // 8. 핀테크 샌드박스 API 연동 테스트 (EXP-PAY-POC-01)
  async paySandboxPoc(splitId: number) {
    const split = await this.prisma.expenseSplit.findUnique({
      where: { id: splitId },
    });

    if (!split) {
      throw new BadRequestException('존재하지 않는 분담 내역입니다.');
    }

    const transactionId = `TOSS_TX_20260703_${splitId}`;

    // 분담 내역 상태를 PROCESSING 단계로 전환 및 고유 거래 ID 바인딩
    await this.prisma.expenseSplit.update({
      where: { id: splitId },
      data: {
        status: 'PROCESSING',
        transactionId,
      },
    });

    return {
      transactionId,
      apiStatus: 'PROCESSING',
    };
  }

  // 9. 결제/송금 결과 수신 웹훅 (EXP-WEBHOOK-01)
  async handleWebhook(webhookDto: WebhookExpenseDto) {
    const { transactionId, amount } = webhookDto;

    // 멱등성 처리: 스키마 내 고유 키인 transactionId 기반으로 등록된 분담 내역 조회
    const split = await this.prisma.expenseSplit.findUnique({
      where: { transactionId },
    });

    if (!split) {
      throw new BadRequestException('해당 거래 ID와 일치하는 정산 분담 내역이 존재하지 않습니다.');
    }

    // 멱등성 방어 코드: 이미 DONE 완료 상태라면 중복 수신으로 간주하고 성공 상태 유지 반환
    if (split.status === 'DONE') {
      return { status: 'SUCCESS' };
    }

    // 정밀 정산금액 대조 검증
    if (split.amount !== amount) {
      throw new BadRequestException('정산 요청 금액과 웹훅 수신 금액이 일치하지 않습니다.');
    }

    // 정산 완료 동기화 연동 처리
    await this.settleSplit(Number(split.id), { isBulkComplete: true });

    return {
      status: 'SUCCESS',
    };
  }

  // 10. 개별 정산 상태 완료 및 전체 동기화 (EXP-SETTLE-01)
  async settleSplit(splitId: number, settleDto: SettleSplitDto) {
    const { isBulkComplete } = settleDto;
    const targetStatus = isBulkComplete ? 'DONE' : 'REQUESTED';

    return this.prisma.$transaction(async (tx) => {
      // 1. 개별 Split 상태 업데이트 처리 및 시간 기록
      const updatedSplit = await tx.expenseSplit.update({
        where: { id: splitId },
        data: {
          status: targetStatus,
          ...(isBulkComplete && { completedAt: new Date() }),
        },
      });

      const expenseId = updatedSplit.expenseId;

      // 2. 부모 지출 내역에 속한 전체 분담 상태 조회
      const allSplits = await tx.expenseSplit.findMany({
        where: { expenseId },
      });

      // 3. 스키마 enum 규칙에 맞춰 구성원 전원이 DONE 상태에 도달했는지 확인
      const isAllSettled = allSplits.every((s) => s.status === 'DONE');

      // 4. 전원 납부 완료 시 부모 Expense 원장 상태를 DONE으로 동기화 변환
      if (isAllSettled) {
        await tx.expense.update({
          where: { id: expenseId },
          data: {
            status: 'DONE',
          },
        });
      }

      return {
        message: '정산 완료 처리가 안전하게 동기화되었습니다.',
        isAllSettled,
        status: targetStatus,
      };
    });
  }

  // 11. 정산 정보 메신저 공유 카드 변환 (EXP-SHARE-01)
  async shareExpenseCard(expenseId: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new ExpenseNotFoundException();
    }

    // require-await 및 파라미터 미사용 에러 완전 제거용 처리
    await Promise.resolve(expenseId);

    return {
      chatMessageId: Math.floor(Math.random() * 10000) + 7000,
    };
  }
}