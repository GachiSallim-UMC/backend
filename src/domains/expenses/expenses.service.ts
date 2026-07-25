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
import { AuthContext } from '../auth/common/auth-context.interface';
import { ExpenseCategory, MessageType, ExpenseSplitStatus, SplitType  } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import * as crypto from 'crypto';

@Injectable()
export class ExpensesService {
  private readonly WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'gachisallim-webhook-secret-key';

  constructor(private readonly prisma: PrismaService) {}

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

    const numericPayerId = Number(payerId);
    const targetGroupId = groupId ? Number(groupId) : 1;

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

    // 그룹 멤버십 검증
    const groupMemberships = await this.prisma.groupMember.findMany({
      where: {
        groupId: BigInt(targetGroupId),
        userId: { in: allRequiredUserIds.map((id) => BigInt(id)) },
      },
      select: { userId: true },
    });
    if (groupMemberships.length !== allRequiredUserIds.length) {
      throw new ForbiddenException('해당 그룹의 멤버가 아닌 사용자가 정산 대상에 포함되어 있습니다.');
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
        where: { groupId: BigInt(groupId), userId: currentUserId },
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
      where: { groupId: expense.groupId, userId: currentUserId },
    });
    if (!isMember) {
      throw new ForbiddenException('해당 정산의 상세 내역을 조회할 권한이 없습니다.');
    }

    return expense;
  }

  // 4. 지출 내역 수정
  async updateExpense(auth: AuthContext, expenseId: number, updateExpenseDto: UpdateExpenseDto) {
    const currentUserId = await this.getUserIdByAuth(auth);

    const expense = await this.prisma.expense.findUnique({
      where: { id: BigInt(expenseId) },
    });
    if (!expense) throw new ExpenseNotFoundException();

    if (expense.createdBy !== currentUserId && expense.payerId !== currentUserId) {
      throw new ForbiddenException('정산 수정 권한이 없습니다. (생성자 또는 선결제자만 가능)');
    }

    const { title, totalAmount, category, splitType } = updateExpenseDto as UpdateExpenseDto & { category?: ExpenseCategory };

    return this.prisma.expense.update({
      where: { id: BigInt(expenseId) },
      data: {
        ...(title && { title }),
        ...(totalAmount !== undefined && { totalAmount }),
        ...(category && { category }),
        ...(splitType && { splitType: splitType }),
      },
    });
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
  async handleWebhook(signature: string, timestamp: string, webhookDto: WebhookExpenseDto) {
    if (!this.WEBHOOK_SECRET) {
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
      .createHmac('sha256', this.WEBHOOK_SECRET)
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

      if (split.userId !== currentUserId && split.expense.payerId !== currentUserId && split.expense.createdBy !== currentUserId) {
        throw new ForbiddenException('해당 정산을 완료 처리할 권한이 없습니다.');
      }
    }

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
      const isAllSettled = allSplits.every((s) => s.status === 'DONE');

      if (isAllSettled) {
        await tx.expense.update({
          where: { id: BigInt(expenseId) },
          data: { status: 'DONE' },
        });
      }

      return {
        message: '정산 완료 처리가 성공적으로 동기화되었습니다.',
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