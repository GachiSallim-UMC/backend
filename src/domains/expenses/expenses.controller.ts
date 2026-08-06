import { 
  Controller, Post, Get, Patch, Delete, 
  Body, Query, Param, ParseIntPipe, HttpCode, HttpStatus, UseGuards, Headers, UnauthorizedException, InternalServerErrorException 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth, ApiHeader, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config'; 
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { GetExpenseQueryDto } from './dto/get-expense-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CalculateExpenseDto } from './dto/calculate-expense.dto';
import { WebhookExpenseDto } from './dto/webhook-expense.dto';
import { SettleSplitDto } from './dto/settle-split.dto';
import { CreateReceiptImageUploadDto } from './dto/create-receipt-image-upload.dto';
import { ReceiptImageUploadResponseDto } from './dto/receipt-image-upload-response.dto';
import { ReceiptImageViewResponseDto } from './dto/receipt-image-view.dto';
import { ReceiptImageService } from './receipt-image.service';

// 인증 가드, 데코레이터 및 인터페이스
import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { CurrentAuth } from '../auth/common/current-auth.decorator';
import { AuthContext } from '../auth/common/auth-context.interface';

@ApiTags('생활비 정산 (EXP)')
@ApiBearerAuth('BearerAuth')
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly configService: ConfigService,
    private readonly receiptImages: ReceiptImageService,
  ) {}

  // ==========================================
  // [1] 정적 라우트 & 생성/조회 API (우선순위 높음)
  // ==========================================

  @Post('receipt-image/upload-url')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '영수증 이미지 업로드 URL 발급',
    description:
      '요청자가 groupId 그룹의 멤버인 경우에만, 최대 10MB의 JPEG, PNG 또는 WebP 파일을 업로드할 수 있는 S3 Presigned POST를 발급합니다.',
  })
  @ApiBody({ type: CreateReceiptImageUploadDto })
  async createReceiptImageUpload(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateReceiptImageUploadDto,
  ): Promise<ReceiptImageUploadResponseDto> {
    return this.receiptImages.createUpload(auth, dto);
  }

  @Post()
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: '비용 등록 및 정산 요청 생성 (EXP-REG-01, EXP-REQ-01)', 
    description: '항목명, 금액, 선지불자, 분담 대상을 입력받아 필수값 검증 후 정산 내역 및 알림을 생성합니다.' 
  })
  async createExpense(
    @CurrentAuth() auth: AuthContext,
    @Body() createExpenseDto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(auth, createExpenseDto);
  }

  @Get()
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '특정 그룹의 정산 현황 목록 조회 (EXP-LIST-01)', 
    description: '그룹 내의 정산 내역 목록을 전체 및 필터 조건에 맞추어 최신순으로 조회합니다.' 
  })
  async getExpenses(
    @CurrentAuth() auth: AuthContext,
    @Query() query: GetExpenseQueryDto,
  ) {
    return this.expensesService.getExpenses(auth, query);
  }

  @Post('calculate')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 금액 미리보기 자동 계산 (EXP-CALC-01)', 
    description: '몫과 나머지를 분배하여 소액에서도 음수 분담금이 발생하지 않도록 미리 계산합니다.' 
  })
  calculateSplits(
    @CurrentAuth() auth: AuthContext,
    @Body() calculateDto: CalculateExpenseDto,
  ) {
    return this.expensesService.calculateSplitsPreview(auth, calculateDto);
  }

  // Secret 필수화 및 기본값 사용 시 Fail-closed 처리
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '결제/송금 결과 수신 웹훅 (EXP-WEBHOOK-01)', 
    description: '결제/송금 완료 웹훅을 수신하여 서명 검증, 타임스탬프 만료 확인 및 멱등 처리를 수행합니다.' 
  })
  @ApiHeader({ name: 'x-signature', description: '웹훅 HMAC SHA-256 서명' })
  @ApiHeader({ name: 'x-timestamp', description: '요청 생성 타임스탬프 (ms)' })
  async handleWebhook(
    @Headers('x-signature') signature: string,
    @Headers('x-timestamp') timestamp: string,
    @Body() webhookDto: WebhookExpenseDto,
  ) {
    const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');

    // Secret 미설정 또는 하드코딩 기본값 사용 시 500 에러로 즉시 차단 (Fail-closed)
    if (!webhookSecret || webhookSecret === 'gachisallim-webhook-secret-key') {
      throw new InternalServerErrorException(
        '서버 설정 오류: WEBHOOK_SECRET 환경변수가 설정되지 않았거나 올바르지 않습니다.',
      );
    }

    if (!signature || !timestamp) {
      throw new UnauthorizedException('웹훅 필수 헤더(x-signature, x-timestamp)가 누락되었습니다.');
    }

    return this.expensesService.handleWebhook(signature, timestamp, webhookDto, webhookSecret);
  }

  // ==========================================
  // [2] Split 서브 단위 도메인 API
  // ==========================================

  @Post('splits/:splitId/paylink')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '외부 송금 앱 연결 정보 생성 (EXP-PAYLINK-01)', 
    description: '수취인, 금액 정보를 기반으로 토스 송금 딥링크 정보를 생성하고 대기 상태로 변경합니다.' 
  })
  @ApiParam({ name: 'splitId', description: '송금할 분담 내역(Split) ID', example: 2 })
  async createPayLink(
    @CurrentAuth() auth: AuthContext,
    @Param('splitId', ParseIntPipe) splitId: number,
  ) {
    return this.expensesService.createPayLink(auth, splitId);
  }

  @Post('splits/:splitId/pay-poc')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '핀테크 샌드박스 API 연동 PoC 테스트 (EXP-PAY-POC-01)', 
    description: '서버에서 외부 핀테크 API 요청 생성 후 인증/로그 저장을 수행합니다.' 
  })
  @ApiParam({ name: 'splitId', description: '테스트할 분담 내역(Split) ID', example: 2 })
  async paySandboxPoc(
    @CurrentAuth() auth: AuthContext,
    @Param('splitId', ParseIntPipe) splitId: number,
  ) {
    return this.expensesService.paySandboxPoc(auth, splitId);
  }

  @Patch('splits/:splitId/settle')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '개별 송금 및 전체 정산 상태 동기화 완료 (EXP-SETTLE-01)', 
    description:
      '대상자별 상태를 완료(DONE)로 변경합니다. isBulkComplete를 false로 명시하면 요청(REQUESTED) 상태로 되돌립니다(철회). ' +
      '그룹 전체 상태는 매 호출마다 다시 계산되어 완료/부분완료/대기 상태로 자동 동기화됩니다.',
  })
  @ApiParam({ name: 'splitId', description: '정산 완료할 분담 내역(Split) ID', example: 2 })
  async settleSplit(
    @CurrentAuth() auth: AuthContext,
    @Param('splitId', ParseIntPipe) splitId: number,
    @Body() settleDto: SettleSplitDto,
  ) {
    return this.expensesService.settleSplit(auth, splitId, settleDto);
  }

  // ==========================================
  // [3] 동적 ID Param 라우트 API (`:expenseId`)
  // ==========================================

  @Get(':expenseId')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 상세 및 개별 송금 페이지 조회 (EXP-DETAIL-01)', 
    description: '정산 상세 정보와 대상자별 부담금 및 미납/완료/선지불 상태를 조회합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '조회할 정산 내역 ID', example: 123 })
  async getExpenseDetail(
    @CurrentAuth() auth: AuthContext,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ) {
    return this.expensesService.getExpenseDetail(auth, expenseId);
  }

  @Patch(':expenseId')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '지출 내역 수정 (EXP-EDIT-01)', 
    description: '등록된 지출 내역의 제목, 금액, 카테고리, 분담 방식 등을 수정합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '수정할 정산 내역 ID', example: 123 })
  @ApiBody({
    type: UpdateExpenseDto,
    examples: {
      equalExample: {
        summary: '1. EQUAL (총액만 변경 - 자동 N분의 1 재계산)',
        description: '총액만 변경할 때 사용합니다. targetMemberIds를 전달하지 않아도 백엔드에서 N분의 1로 자동 재계산됩니다.',
        value: {
          title: '5월 관리비 수정',
          totalAmount: 95000,
          category: 'FOOD',
          splitType: 'EQUAL',
        },
      },
      ratioAutoExample: {
        summary: '2. RATIO (총액만 변경 - 기존 비율 유지)',
        description: '비율 수정 없이 총액만 변경할 때 사용합니다. targetMemberIds를 생략해도 기존 멤버들의 분담 비율에 맞춰 백엔드에서 자동 비례 재계산됩니다.',
        value: {
          title: '여행 경비 수정',
          totalAmount: 150000,
          category: 'SHOPPING',
          splitType: 'RATIO',
        },
      },
      ratioCustomExample: {
        summary: '3. RATIO (참여자별 비율 변경)',
        description: '분담 비율 자체를 수정할 때 사용합니다. targetMemberIds 배열에 각 유저의 새 비율(percentage)을 담아 전달합니다.',
        value: {
          title: '여행 경비 비율 수정',
          totalAmount: 200000,
          category: 'SHOPPING',
          splitType: 'RATIO',
          targetMemberIds: [
            { userId: '12', percentage: 70 },
            { userId: '2', percentage: 30 },
          ],
        },
      },
      customExample: {
        summary: '4. CUSTOM (멤버별 금액 직접 지정)',
        description: '참여자별 금액을 직접 변경할 때 사용합니다. targetMemberIds 배열에 각 유저의 지정 금액(amount)을 담아 전달합니다.',
        value: {
          title: '5월 회식비 수정',
          totalAmount: 100000,
          category: 'FOOD',
          splitType: 'CUSTOM',
          targetMemberIds: [
            { userId: '12', amount: 60000 },
            { userId: '2', amount: 40000 },
          ],
        },
      },
    },
  })
  async updateExpense(
    @CurrentAuth() auth: AuthContext,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(auth, expenseId, updateExpenseDto);
  }

  @Delete(':expenseId')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 요청 취소 및 전체 삭제 (EXP-CNCL-01)', 
    description: '잘못 등록된 정산 요청을 취소하고 연관 분담 내역을 파기합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '삭제할 정산 내역 ID', example: 123 })
  async deleteExpense(
    @CurrentAuth() auth: AuthContext,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ) {
    return this.expensesService.deleteExpense(auth, expenseId);
  }

  @Post(':expenseId/share')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 정보 메신저 공유 카드 변환 (EXP-SHARE-01)', 
    description: '정산 내역을 바탕으로 실제 그룹 채팅방 메시지를 생성하고 그 ID를 반환합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '공유할 정산 내역 ID', example: 123 })
  async shareExpenseCard(
    @CurrentAuth() auth: AuthContext,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ) {
    return this.expensesService.shareExpenseCard(auth, expenseId);
  }

  @Get(':expenseId/receipt-image')
  @UseGuards(CognitoAccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '영수증 이미지 조회 URL 발급',
    description:
      '요청자가 해당 정산이 속한 그룹의 멤버인 경우에만, 5분간 유효한 영수증 이미지 조회용 서명 URL을 발급합니다. ' +
      '등록된 영수증 이미지가 없는 경우 에러 대신 viewUrl: null로 응답합니다.',
  })
  @ApiParam({ name: 'expenseId', description: '영수증을 조회할 정산 내역 ID', example: 123 })
  async getReceiptImageViewUrl(
    @CurrentAuth() auth: AuthContext,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ): Promise<ReceiptImageViewResponseDto> {
    return this.receiptImages.createViewUrl(auth, BigInt(expenseId));
  }
}
