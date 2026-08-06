import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CalculateExpenseDto } from './dto/calculate-expense.dto';
import { WebhookExpenseDto } from './dto/webhook-expense.dto';
import { GetExpenseQueryDto } from './dto/get-expense-query.dto';
import { SettleSplitDto } from './dto/settle-split.dto';
import { ExpenseNotFoundException } from './expenses.exception';
import { ReceiptImageService } from './receipt-image.service';
import { AuthContext } from '../auth/common/auth-context.interface';
import { ExpenseCategory, MessageType, ExpenseSplitStatus, SplitType } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import * as crypto from 'crypto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptImages: ReceiptImageService,
  ) {}

  // DB User.id 조회
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

 // 1. 비용 등록 및 정산 요청 생성
  async createExpense(auth: AuthContext, createExpenseDto: CreateExpenseDto) {
    const {
      groupId,
      title,
      amount,
      payerId,
      date,
      splitType,
      category,
      targetMemberIds,
      memo,
      receiptUrl
    } = createExpenseDto;

    const currentUserId = await this.getUserIdByAuth(auth);

    if (!targetMemberIds || targetMemberIds.length === 0) {
      throw new BadRequestException('정산 대상 멤버가 최소 1명 이상 필요합니다.');
    }

    // 정산 금액 및 비율 합계 부합성 검증 로직
    if (splitType === SplitType.CUSTOM) {
      const sumAmount = targetMemberIds.reduce((sum, m) => sum + (m.amount ?? 0), 0);
      if (sumAmount !== amount) {
        throw new BadRequestException(
          `각 멤버별 분담금 합계(${sumAmount.toLocaleString()}원)가 총 정산 금액(${amount.toLocaleString()}원)과 일치하지 않습니다.`
        );
      }
    } else if (splitType === SplitType.RATIO) {
      const sumPercentage = targetMemberIds.reduce((sum, m) => sum + (m.percentage ?? 0), 0);
      if (sumPercentage !== 100) {
        throw new BadRequestException(
          `분담 비율의 총합(${sumPercentage}%)은 반드시 100%이어야 합니다.`
        );
      }
    }

    const numericPayerId = Number(payerId);
    const targetGroupId = groupId ? Number(groupId) : 1;

    // 1-1. 요청자(로그인 유저) 본인이 해당 그룹의 활성 구성원(leftAt: null)인지 검증
    const requesterMembership = await this.prisma.groupMember.findFirst({
      where: {
        groupId: BigInt(targetGroupId),
        userId: currentUserId,
        leftAt: null, // 탈퇴 구성원 제외
      },
    });

    if (!requesterMembership) {
      throw new ForbiddenException('해당 그룹의 활성 구성원만 정산을 생성할 수 있습니다.');
    }

    // 중복 유저 ID 제거 및 정산 대상 목록 추출
    const targetUserMap = new Map<number, { amount?: number; percentage?: number }>();
    targetMemberIds.forEach((m) => {
      targetUserMap.set(Number(m.userId), { amount: m.amount, percentage: m.percentage });
    });

    const numericTargetIds = Array.from(targetUserMap.keys());
    const count = numericTargetIds.length;
    const allRequiredUserIds = Array.from(new Set([numericPayerId, ...numericTargetIds]));

    // 유저 존재 검증
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: allRequiredUserIds.map((id) => BigInt(id)) } },
      select: { id: true },
    });
    if (existingUsers.length !== allRequiredUserIds.length) {
      throw new BadRequestException('존재하지 않는 사용자 ID가 정산 대상에 포함되어 있습니다.');
    }

    // 1-2. 정산 참여 유저들이 대상 그룹의 활성 멤버(leftAt: null)인지 검증
    const groupMemberships = await this.prisma.groupMember.findMany({
      where: {
        groupId: BigInt(targetGroupId),
        userId: { in: allRequiredUserIds.map((id) => BigInt(id)) },
        leftAt: null, // 탈퇴 구성원 배제 조건 추가
      },
      select: { userId: true },
    });
    if (groupMemberships.length !== allRequiredUserIds.length) {
      throw new ForbiddenException('해당 그룹의 멤버가 아니거나 이미 탈퇴한 사용자가 정산 대상에 포함되어 있습니다.');
    }

    if (receiptUrl) {
      this.receiptImages.assertReceiptKeyBelongsToGroup(BigInt(targetGroupId), receiptUrl);
      await this.receiptImages.assertObjectExists(receiptUrl);
    }

    // 정산 분담금 계산
    let baseAmount = 0;
    let remainder = 0;

    if (splitType === SplitType.EQUAL) {
      baseAmount = Math.floor(amount / count);
      remainder = amount % count;
    }

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId: BigInt(targetGroupId),
          category: category ?? ExpenseCategory.ETC,
          title,
          totalAmount: amount,
          payerId: BigInt(numericPayerId),
          createdBy: currentUserId,
          splitType: splitType,
          ...(memo && { memo }),
          ...(receiptUrl && { receiptUrl }),
          ...(date && { createdAt: new Date(date) }),
        },
      });

      const splitData = numericTargetIds.map((participantId) => {
        const isPayer = participantId === numericPayerId;
        const participantInfo = targetUserMap.get(participantId);
        let participantAmount = 0;

        if (splitType === SplitType.EQUAL) {
          participantAmount = baseAmount;
          if (remainder > 0) {
            participantAmount += 1;
            remainder -= 1;
          }
        } else if (splitType === SplitType.CUSTOM) {
          participantAmount = participantInfo?.amount ?? 0;
        } else if (splitType === SplitType.RATIO) {
          const pct = participantInfo?.percentage ?? 0;
          participantAmount = Math.floor(amount * (pct / 100));
        }

        return {
          expenseId: expense.id,
          userId: BigInt(participantId),
          amount: participantAmount,
          status: (isPayer ? 'PRE_PAID' : 'REQUESTED') as ExpenseSplitStatus,
        };
      });

      await tx.expenseSplit.createMany({
        data: splitData,
      });

      return {
        message: '정산 요청이 성공적으로 생성되었습니다.',
        expenseId: Number(expense.id),
      };
    });
  }

  // 2. 그룹별 정산 목록 조회
  async getExpenses(auth: AuthContext, query: GetExpenseQueryDto) {
    const { groupId, category, userId } = query;
    const currentUserId = await this.getUserIdByAuth(auth);

    if (groupId) {
      const isMember = await this.prisma.groupMember.findFirst({
        where: { groupId: BigInt(groupId), userId: currentUserId, leftAt: null },
      });
      if (!isMember) {
        throw new ForbiddenException('해당 그룹의 정산 내역을 조회할 권한이 없습니다.');
      }
    }

    return this.getExpensesByGroup(groupId, category, userId);
  }

  async getExpensesByGroup(groupId?: number, category?: ExpenseCategory, userId?: number) {
    return this.prisma.expense.findMany({
      where: {
        ...(groupId && { groupId: BigInt(groupId) }),
        ...(category && { category }),
        ...(userId && { payerId: BigInt(userId) }),
      },
      include: {
        splits: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. 정산 상세 내역 조회
  async getExpenseDetail(auth: AuthContext, expenseId: number) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const expense = await this.prisma.expense.findUnique({
      where: { id: BigInt(expenseId) },
      include: {
        splits: { include: { user: true } },
      },
    });

    if (!expense) throw new ExpenseNotFoundException();

    const isMember = await this.prisma.groupMember.findFirst({
      where: { groupId: expense.groupId, userId: currentUserId, leftAt: null },
    });
    if (!isMember) {
      throw new ForbiddenException('해당 정산의 상세 내역을 조회할 권한이 없습니다.');
    }

    return expense;
  }

  // 4. 지출 내역 수정
  async updateExpense(auth: AuthContext, expenseId: number, updateExpenseDto: UpdateExpenseDto) {
    const currentUserId = await this.getUserIdByAuth(auth);
    const numericExpenseId = BigInt(expenseId);

    // 1. 기존 지출 정보 및 분담 내역(splits) 함께 조회
    const expense = await this.prisma.expense.findUnique({
      where: { id: numericExpenseId },
      include: {
        splits: true,
      },
    });
    if (!expense) throw new ExpenseNotFoundException();

    // 2. 권한 검증 (생성자 또는 선결제자만 가능)
    if (expense.createdBy !== currentUserId && expense.payerId !== currentUserId) {
      throw new ForbiddenException('정산 수정 권한이 없습니다. (생성자 또는 선결제자만 가능)');
    }

    const { title, totalAmount, category, splitType, targetMemberIds, receiptUrl } = updateExpenseDto as UpdateExpenseDto & {
      category?: ExpenseCategory;
    };

    if (receiptUrl) {
      this.receiptImages.assertReceiptKeyBelongsToGroup(expense.groupId, receiptUrl);
      await this.receiptImages.assertObjectExists(receiptUrl);
    }

    // 변경될 핵심 값들 (전달되지 않았으면 기존 값 유지)
    const newTotalAmount = totalAmount ?? expense.totalAmount;
    const newSplitType = splitType ?? expense.splitType;

    // 💡 [추가] targetMemberIds 전달 시 총액 및 비율 검증 로직
    if (targetMemberIds && targetMemberIds.length > 0) {
      if (newSplitType === SplitType.CUSTOM) {
        const sumAmount = targetMemberIds.reduce((sum, m) => sum + (m.amount ?? 0), 0);
        if (sumAmount !== newTotalAmount) {
          throw new BadRequestException(
            `각 멤버별 분담금 합계(${sumAmount.toLocaleString()}원)가 총 정산 금액(${newTotalAmount.toLocaleString()}원)과 일치하지 않습니다.`
          );
        }
      } else if (newSplitType === SplitType.RATIO) {
        const sumPercentage = targetMemberIds.reduce((sum, m) => sum + (m.percentage ?? 0), 0);
        if (sumPercentage !== 100) {
          throw new BadRequestException(
            `분담 비율의 총합(${sumPercentage}%)은 반드시 100%이어야 합니다.`
          );
        }
      }
    }

    // 총액이나 분담 방식이 실제로 변경되었는지 여부
    const isCalculationChanged =
      (totalAmount !== undefined && totalAmount !== expense.totalAmount) ||
      (splitType !== undefined && splitType !== expense.splitType);

    // 3. 트랜잭션으로 지출 내역과 분담 내역 함께 업데이트
    const updateResult = await this.prisma.$transaction(async (tx) => {
      // 3-1. Expense 테이블 기본 정보 업데이트
      const updatedExpense = await tx.expense.update({
        where: { id: numericExpenseId },
        data: {
          ...(title && { title }),
          ...(totalAmount !== undefined && { totalAmount }),
          ...(category && { category }),
          ...(splitType && { splitType }),
          ...(receiptUrl !== undefined && { receiptUrl }),
        },
      });

      // 3-2. 분담 내역(splits) 갱신 로직
      if (targetMemberIds && targetMemberIds.length > 0) {
        // ⭕ Case A: 프론트에서 targetMemberIds를 보낸 경우 (CUSTOM 지정, 비율 변경, 멤버 변경 등)
        await tx.expenseSplit.deleteMany({
          where: { expenseId: numericExpenseId },
        });

        const newSplits = targetMemberIds.map((member) => {
          let calculatedAmount = member.amount ?? 0;

          // RATIO 방식이면서 percentage가 넘어온 경우 비례 계산
          if (newSplitType === SplitType.RATIO && member.percentage !== undefined) {
            calculatedAmount = Math.floor((newTotalAmount * member.percentage) / 100);
          }

          const memberUserId = BigInt(member.userId);
          return {
            expenseId: numericExpenseId,
            userId: memberUserId,
            amount: calculatedAmount,
            status: memberUserId === expense.payerId ? ExpenseSplitStatus.PRE_PAID : ExpenseSplitStatus.REQUESTED,
          };
        });

        await tx.expenseSplit.createMany({
          data: newSplits,
        });

      } else if (isCalculationChanged && expense.splits.length > 0) {
        // ⭕ Case B: targetMemberIds 없이 총액/분담방식만 수정된 경우 (기존 멤버 및 비율 유지)
        const splits = expense.splits;
        const count = splits.length;

        if (newSplitType === SplitType.EQUAL) {
          // [EQUAL] N분의 1 재계산 (소액/나머지 1원 단위 분배)
          const baseAmount = Math.floor(newTotalAmount / count);
          let remainder = newTotalAmount % count;

          for (const split of splits) {
            let participantAmount = baseAmount;
            if (remainder > 0) {
              participantAmount += 1;
              remainder -= 1;
            }

            await tx.expenseSplit.update({
              where: { id: split.id },
              data: { amount: participantAmount },
            });
          }
        } else if (newSplitType === SplitType.RATIO) {
          // [RATIO] 기존 분담 비율(기존 분담금 / 기존 총액)을 유지하며 비례 재계산
          const oldTotalAmount = expense.totalAmount;

          for (const split of splits) {
            const ratio = oldTotalAmount > 0 ? split.amount / oldTotalAmount : 1 / count;
            const recalculatedAmount = Math.floor(newTotalAmount * ratio);

            await tx.expenseSplit.update({
              where: { id: split.id },
              data: { amount: recalculatedAmount },
            });
          }
        }
      }

      return updatedExpense;
    });

    // 4. 영수증 이미지가 다른 값으로 교체된 경우, 더 이상 참조되지 않는 기존 오브젝트를 정리한다.
    if (receiptUrl !== undefined && expense.receiptUrl && expense.receiptUrl !== receiptUrl) {
      await this.receiptImages.deleteObject(expense.receiptUrl);
    }

    return updateResult;
  }
  // 5. 지출 내역 삭제
  async deleteExpense(auth: AuthContext, expenseId: number) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const expense = await this.prisma.expense.findUnique({
      where: { id: BigInt(expenseId) },
    });
    if (!expense) throw new ExpenseNotFoundException();

    if (expense.createdBy !== currentUserId) {
      throw new ForbiddenException('정산 삭제 권한이 없습니다. (생성자만 가능)');
    }

    await this.prisma.expense.delete({
      where: { id: BigInt(expenseId) },
    });

    if (expense.receiptUrl) {
      await this.receiptImages.deleteObject(expense.receiptUrl);
    }

    return {
      message: '지출 내역이 성공적으로 삭제되었습니다.',
      deletedExpenseId: expenseId,
    };
  }

  // 6. 정산 금액 미리보기 계산
  calculateSplitsPreview(auth: AuthContext, dto: CalculateExpenseDto) {
    const { totalAmount, participants } = dto;

    const uniqueParticipants = Array.from(new Set(participants));
    const count = uniqueParticipants.length;

    if (count === 0) {
      throw new BadRequestException('참여 유저 목록이 유효하지 않습니다.');
    }

    const baseAmount = Math.floor(totalAmount / count);
    let remainder = totalAmount % count;

    const calculatedSplits = uniqueParticipants.map((participantId, index) => {
      let finalAmount = baseAmount;
      if (remainder > 0) {
        finalAmount += 1;
        remainder -= 1;
      }

      return {
        userId: participantId,
        amount: finalAmount,
        role: index === 0 ? 'RECEIVER' : ('SENDER' as const),
      };
    });

    return {
      totalAmount,
      calculatedSplits,
    };
  }

  // 7. 송금 링크 생성
  async createPayLink(auth: AuthContext, splitId: number) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const split = await this.prisma.expenseSplit.findUnique({
      where: { id: BigInt(splitId) },
    });

    if (!split) throw new BadRequestException('존재하지 않는 분담 내역입니다.');

    if (split.userId !== currentUserId) {
      throw new ForbiddenException('본인의 분담금에 대해서만 결제 링크를 생성할 수 있습니다.');
    }

    const bank = 'SHINHAN';
    const accountNo = '110123456789';
    const amount = split.amount;

    const deepLinkUrl = `supertoss://send?bank=${bank}&accountNo=${accountNo}&amount=${amount}`;

    const updatedSplit = await this.prisma.expenseSplit.update({
      where: { id: BigInt(splitId) },
      data: { status: 'TRANSFER_PENDING' },
    });

    return { deepLinkUrl, status: updatedSplit.status };
  }

  // 8. 핀테크 결제 POC
  async paySandboxPoc(auth: AuthContext, splitId: number) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const split = await this.prisma.expenseSplit.findUnique({
      where: { id: BigInt(splitId) },
    });

    if (!split) throw new BadRequestException('존재하지 않는 분담 내역입니다.');
    if (split.userId !== currentUserId) {
      throw new ForbiddenException('본인의 분담금에 대해서만 결제를 진행할 수 있습니다.');
    }

    const secureRandomHex = crypto.randomBytes(16).toString('hex');
    const transactionId = `TX_${Date.now()}_${secureRandomHex}`;

    await this.prisma.expenseSplit.update({
      where: { id: BigInt(splitId) },
      data: {
        status: 'PROCESSING',
        transactionId,
      },
    });

    return { transactionId, apiStatus: 'PROCESSING' };
  }

  // 9. 결제 수신 웹훅 처리
  async handleWebhook(signature: string, timestamp: string, webhookDto: WebhookExpenseDto, webhookSecret?: string) {
    const secret = webhookSecret;
    if (!secret) {
      throw new InternalServerErrorException('웹훅 검증용 Secret Key가 서버에 설정되지 않았습니다.');
    }

    if (!signature || !timestamp) {
      throw new UnauthorizedException('웹훅 헤더 정보(x-signature, x-timestamp)가 누락되었습니다.');
    }

    const { transactionId, amount } = webhookDto;

    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
      throw new UnauthorizedException('만료되었거나 유효하지 않은 웹훅 타임스탬프입니다.');
    }

    const payload = `${timestamp}.${transactionId}.${amount}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret) // 지역변수 사용
      .update(payload)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new UnauthorizedException('웹훅 서명(Signature) 검증에 실패했습니다.');
    }

    const split = await this.prisma.expenseSplit.findUnique({
      where: { transactionId },
    });

    if (!split) {
      throw new BadRequestException('해당 거래 ID와 일치하는 정산 분담 내역이 존재하지 않습니다.');
    }

    if (split.status === 'DONE') {
      return { status: 'SUCCESS', message: '이미 처리 완료된 거래입니다.' };
    }

    const ALLOWED_PREVIOUS_STATUSES = ['TRANSFER_PENDING', 'PROCESSING', 'REQUESTED'];
    if (!ALLOWED_PREVIOUS_STATUSES.includes(split.status)) {
      throw new BadRequestException(`현재 분담 상태(${split.status})에서는 완료 처리할 수 없습니다.`);
    }

    if (split.amount !== amount) {
      throw new BadRequestException('정산 요청 금액과 웹훅 수신 금액이 일치하지 않습니다.');
    }

    const systemAuthContext: AuthContext = { cognitoSub: 'SYSTEM', accessToken: '' };
    await this.settleSplit(systemAuthContext, Number(split.id), { isBulkComplete: true });

    return { status: 'SUCCESS' };
  }

  // 10. 분담 상태 완료 처리
  async settleSplit(auth: AuthContext, splitId: number, settleDto?: SettleSplitDto) {
    if (auth.cognitoSub !== 'SYSTEM') {
      const currentUserId = await this.getUserIdByAuth(auth);
      const split = await this.prisma.expenseSplit.findUnique({
        where: { id: BigInt(splitId) },
        include: { expense: true },
      });

      if (!split) throw new BadRequestException('존재하지 않는 분담 내역입니다.');

      if (
        split.userId !== currentUserId &&
        split.expense.payerId !== currentUserId &&
        split.expense.createdBy !== currentUserId
      ) {
        throw new ForbiddenException('해당 정산을 완료 처리할 권한이 없습니다.');
      }
    }

    // isBulkComplete: true(기본값)이면 대상 split을 완료(DONE) 처리, false를 명시하면
    // 요청(REQUESTED) 상태로 되돌린다(철회).
    const isBulkComplete = settleDto?.isBulkComplete ?? true;
    const targetStatus = isBulkComplete ? 'DONE' : 'REQUESTED';

    return this.prisma.$transaction(async (tx) => {
      const updatedSplit = await tx.expenseSplit.update({
        where: { id: BigInt(splitId) },
        data: {
          status: targetStatus,
          ...(isBulkComplete && { completedAt: new Date() }),
        },
      });

      const expenseId = updatedSplit.expenseId;
      const allSplits = await tx.expenseSplit.findMany({ where: { expenseId } });
      const settledCount = allSplits.filter((s) => s.status === 'DONE' || s.status === 'PRE_PAID').length;
      const isAllSettled = settledCount === allSplits.length;
      const expenseStatus = isAllSettled ? 'DONE' : settledCount > 0 ? 'PARTIAL' : 'PENDING';

      await tx.expense.update({
        where: { id: BigInt(expenseId) },
        data: { status: expenseStatus },
      });

      return {
        message: isBulkComplete
          ? '정산 완료 처리가 성공적으로 동기화되었습니다.'
          : '정산 완료 처리가 철회되어 요청 상태로 되돌아갔습니다.',
        isAllSettled,
        status: targetStatus,
      };
    });
  }

  // 11. 정산 정보 카드 메시지 공유
  async shareExpenseCard(auth: AuthContext, expenseId: number) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const expense = await this.prisma.expense.findUnique({
      where: { id: BigInt(expenseId) },
    });
    if (!expense) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const chatRoom = await this.prisma.chatRoom.findFirst({
      where: {
        groupId: expense.groupId,
        isDefault: true,
      },
    });
    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }

    const chatRoomMember = await this.prisma.chatRoomMember.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId: chatRoom.id,
          userId: currentUserId,
        },
      },
    });
    if (!chatRoomMember) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_NOT_FOUND);
    }

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: chatRoom.id,
        senderId: currentUserId,
        type: MessageType.CARD_EXPENSE,
        content: `[정산 알림] '${expense.title}' (${expense.totalAmount.toLocaleString()}원) 정산 카드가 공유되었습니다.`,
        refId: expense.id,
      },
    });

    return {
      expenseId: Number(expense.id),
      messageId: Number(message.id),
    };
  }
}