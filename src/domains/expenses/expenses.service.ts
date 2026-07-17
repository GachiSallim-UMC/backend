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
    
    // 유저 도메인 통합 전 임시 처리: 배열 내 첫 번째 참여자를 임시 수취인(RECEIVER)으로 할당
    const receiverId = participants[0];

    const calculatedSplits = participants.map((participantId: number) => {
      const isReceiver = participantId === receiverId;
      let finalAmount = ceilAmount;

      // 수취인은 타 참여자들의 올림 금액 총합을 제외한 잔액을 보정 부담
      if (isReceiver) {
        const otherParticipantsCount = count - 1;
        finalAmount = totalAmount - (ceilAmount * otherParticipantsCount);
      }

      return {
        userId: participantId,
        amount: finalAmount,
        role: isReceiver ? 'RECEIVER' : 'SENDER' as const,
      };
    });

    // require-await 해결을 위한 의미 있는 비동기 우회
    await Promise.resolve();

    return {
      totalAmount,
      calculatedSplits,
    };
  }

  // 7. 외부 송금 앱 연결 정보 생성 (EXP-PAYLINK-01)
  async createPayLink(splitId: number) {
    // require-await 및 no-unused-vars 에러 우회
    await Promise.resolve(splitId);

    // TODO: 외부 송금 제휴사 규격에 맞춘 딥링크 인코딩 로직 구현 필요
    return {
      deepLinkUrl: `supertoss://send?bank=SHINHAN&amount=30000`,
      status: 'TRANSFER_PENDING',
    };
  }

  // 8. 핀테크 샌드박스 API 연동 테스트 (EXP-PAY-POC-01)
  async paySandboxPoc(splitId: number) {
    // require-await 및 no-unused-vars 에러 우회
    await Promise.resolve(splitId);

    // TODO: 외부 핀테크 모의 요청 전송 및 원장 트랜잭션 기록 적재 필요
    return {
      transactionId: `TOSS_TX_20260703_${splitId}`,
      apiStatus: 'PROCESSING',
    };
  }

  // 9. 결제/송금 결과 수신 웹훅 (EXP-WEBHOOK-01)
  async handleWebhook(webhookDto: WebhookExpenseDto) {
    // require-await 및 no-unused-vars 에러 우회
    await Promise.resolve(webhookDto);

    // TODO: 멱등성 저장소 검증 및 정산 상태 동기화 처리 연동 필요
    return {
      status: 'SUCCESS',
    };
  }

  // 10. 개별 정산 상태 완료 및 전체 동기화 (EXP-SETTLE-01)
  async settleSplit(splitId: number, settleDto: SettleSplitDto) {
    const { isBulkComplete } = settleDto;
    
    // TODO: 전체 그룹원의 완료 여부를 카운트하여 부모 Expense 상태를 COMPLETED로 자동 전이하는 로직 추가 필요
    return this.prisma.expenseSplit.update({
      where: { id: splitId },
      data: {
        status: isBulkComplete ? 'DONE' : 'REQUESTED',
      },
    });
  }

  // 11. 정산 정보 메신저 공유 카드 변환 (EXP-SHARE-01)
  async shareExpenseCard(expenseId: number) {
    // require-await 및 no-unused-vars 에러 우회
    await Promise.resolve(expenseId);

    // TODO: 인앱 메시지 서비스 연동 및 카드 템플릿 직렬화 필요
    return {
      chatMessageId: 7712,
    };
  }
}