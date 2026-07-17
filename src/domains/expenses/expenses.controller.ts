import { 
  Controller, Post, Get, Patch, Delete, 
  Body, Query, Param, ParseIntPipe, HttpCode, HttpStatus 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { GetExpenseQueryDto } from './dto/get-expense-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CalculateExpenseDto } from './dto/calculate-expense.dto';
import { WebhookExpenseDto } from './dto/webhook-expense.dto';
import { SettleSplitDto } from './dto/settle-split.dto';

@ApiTags('생활비 정산 (EXP)')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // ==========================================
  // [1] 기존 CRUD API 
  // ==========================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: '비용 등록 및 정산 요청 생성 (EXP-REG-01, EXP-REQ-01)', 
    description: '항목명, 금액, 선지불자, 분담 대상을 입력받아 필수값 검증 후 정산 내역 및 알림을 생성합니다.' 
  })
  async createExpense(@Body() createExpenseDto: CreateExpenseDto) {
    return this.expensesService.createExpense(createExpenseDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '특정 그룹의 정산 현황 목록 조회 (EXP-LIST-01)', 
    description: '그룹 내의 정산 내역 목록을 전체 및 필터 조건에 맞추어 최신순으로 조회합니다.' 
  })
  async getExpenses(@Query() query: GetExpenseQueryDto) {
    return this.expensesService.getExpenses(query);
  }

  @Get(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 상세 및 개별 송금 페이지 조회 (EXP-DETAIL-01)', 
    description: '정산 상세 정보와 대상자별 부담금 및 미납/완료/선지불 상태를 조회합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '조회할 정산 내역 ID', example: 123 })
  async getExpenseDetail(@Param('expenseId', ParseIntPipe) expenseId: number) {
    return this.expensesService.getExpenseDetail(expenseId);
  }

  @Patch(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '지출 내역 수정 (EXP-EDIT-01)', 
    description: '등록된 지출 내역의 제목, 금액, 카테고리 등을 수정합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '수정할 정산 내역 ID', example: 123 })
  async updateExpense(
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(expenseId, updateExpenseDto);
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 요청 취소 및 전체 삭제 (EXP-CNCL-01)', 
    description: '잘못 등록된 정산 요청을 취소하고 연관 분담 내역을 파기합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '삭제할 정산 내역 ID', example: 123 })
  async deleteExpense(@Param('expenseId', ParseIntPipe) expenseId: number) {
    return this.expensesService.deleteExpense(expenseId);
  }

  // ==========================================
  // [2] 신규 고도화 비즈니스 로직 API (EXP-CALC ~ EXP-SHARE)
  // ==========================================

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 금액 미리보기 자동 계산 (EXP-CALC-01)', 
    description: '원 단위 절사 정책을 적용해 대상자별 부담금을 미리 계산합니다.' 
  })
  async calculateSplits(@Body() calculateDto: CalculateExpenseDto) {
    return this.expensesService.calculateSplitsPreview(calculateDto);
  }

  @Post('splits/:splitId/paylink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '외부 송금 앱 연결 정보 생성 (EXP-PAYLINK-01)', 
    description: '수취인, 금액 정보를 기반으로 토스 송금 딥링크 정보를 생성하고 대기 상태로 변경합니다.' 
  })
  @ApiParam({ name: 'splitId', description: '송금할 분담 내역(Split) ID', example: 2 })
  async createPayLink(@Param('splitId', ParseIntPipe) splitId: number) {
    return this.expensesService.createPayLink(splitId);
  }

  @Post('splits/:splitId/pay-poc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '핀테크 샌드박스 API 연동 PoC 테스트 (EXP-PAY-POC-01)', 
    description: '서버에서 외부 핀테크 API 요청 생성 후 인증/로그 저장을 수행합니다.' 
  })
  @ApiParam({ name: 'splitId', description: '테스트할 분담 내역(Split) ID', example: 2 })
  async paySandboxPoc(@Param('splitId', ParseIntPipe) splitId: number) {
    return this.expensesService.paySandboxPoc(splitId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '결제/송금 결과 수신 웹훅 (EXP-WEBHOOK-01)', 
    description: '결제/송금 완료 웹훅을 수신하여 서명 검증 및 멱등 처리를 수행합니다.' 
  })
  async handleWebhook(@Body() webhookDto: WebhookExpenseDto) {
    return this.expensesService.handleWebhook(webhookDto);
  }

  @Patch('splits/:splitId/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '개별 송금 및 전체 정산 상태 동기화 완료 (EXP-SETTLE-01)', 
    description: '대상자별 상태를 완료로 변경하고, 그룹 전체 완료 시 부모 정산 상태를 자동으로 완료(COMPLETED) 처리합니다.' 
  })
  @ApiParam({ name: 'splitId', description: '정산 완료할 분담 내역(Split) ID', example: 2 })
  async settleSplit(
    @Param('splitId', ParseIntPipe) splitId: number,
    @Body() settleDto: SettleSplitDto,
  ) {
    return this.expensesService.settleSplit(splitId, settleDto);
  }

  @Post(':expenseId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '정산 정보 메신저 공유 카드 변환 (EXP-SHARE-01)', 
    description: '정산 내역을 카카오톡/메신저 공유 카드 템플릿 형태로 변환하여 전송합니다.' 
  })
  @ApiParam({ name: 'expenseId', description: '공유할 정산 내역 ID', example: 123 })
  async shareExpenseCard(@Param('expenseId', ParseIntPipe) expenseId: number) {
    return this.expensesService.shareExpenseCard(expenseId);
  }
}