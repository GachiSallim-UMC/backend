import { ApiProperty } from '@nestjs/swagger';
import {
  ExpenseCategory,
  ExpenseSplitStatus,
  ExpenseStatus,
  SplitType,
  SupplyStatus,
} from '@prisma/client';

export class PurchaseSupplyLogDto {
  @ApiProperty({
    enum: SupplyStatus,
    enumName: 'SupplyStatus',
    nullable: true,
    example: SupplyStatus.LOW,
    description: '직전 상태. 이력이 없으면 null',
  })
  prevStatus!: SupplyStatus | null;

  @ApiProperty({
    enum: SupplyStatus,
    enumName: 'SupplyStatus',
    example: SupplyStatus.PURCHASED,
    description: '변경된 상태',
  })
  nextStatus!: SupplyStatus;

  // nullable union은 reflect-metadata가 Object로 추론해 스키마가 `type: object`가 된다.
  // 명시적으로 type을 지정해야 생성된 Swagger 스키마가 실제 필드 타입을 반영한다.
  @ApiProperty({ type: String, nullable: true, example: null, description: '상태 변경 메모' })
  note!: string | null;
}

export class PurchaseSupplyExpenseSplitDto {
  @ApiProperty({
    type: 'integer',
    example: 301,
    description:
      '생성된 분담 내역 ID. `PATCH /api/v1/expenses/splits/{splitId}/settle` 호출에 그대로 사용한다.',
  })
  splitId!: number;

  @ApiProperty({ type: 'integer', example: 5, description: '분담 대상 사용자 ID' })
  userId!: number;

  @ApiProperty({ type: 'integer', example: 2967, description: '해당 사용자의 부담금(원)' })
  amount!: number;

  @ApiProperty({
    enum: ExpenseSplitStatus,
    enumName: 'ExpenseSplitStatus',
    example: ExpenseSplitStatus.REQUESTED,
    description: '분담 상태. 선지불자(구매자)는 PRE_PAID, 나머지는 REQUESTED로 생성된다.',
  })
  status!: ExpenseSplitStatus;
}

export class PurchaseSupplyExpenseDto {
  @ApiProperty({ type: 'integer', example: 88, description: '생성된 정산(Expense) ID' })
  expenseId!: number;

  @ApiProperty({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    example: ExpenseCategory.SHOPPING,
  })
  category!: ExpenseCategory;

  @ApiProperty({ example: '화장지', description: '정산 항목명. 물품명이 그대로 들어간다.' })
  title!: string;

  @ApiProperty({
    type: 'integer',
    example: 5,
    description: '선지불자 사용자 ID. 구매를 수행한 요청자다.',
  })
  payerId!: number;

  @ApiProperty({ type: 'integer', example: 8900, description: '총 구매 금액(원)' })
  totalAmount!: number;

  @ApiProperty({
    enum: SplitType,
    enumName: 'SplitType',
    example: SplitType.EQUAL,
    description: '분담 방식',
  })
  splitType!: SplitType;

  @ApiProperty({
    enum: ExpenseStatus,
    enumName: 'ExpenseStatus',
    example: ExpenseStatus.PENDING,
    description:
      '정산 상태. 분담 대상이 구매자 한 명뿐이라 생성된 split이 전부 PRE_PAID이면 DONE으로 생성된다.',
  })
  status!: ExpenseStatus;

  @ApiProperty({
    type: [PurchaseSupplyExpenseSplitDto],
    description: '활성 그룹 구성원 전원 기준 균등 분담 내역. userId 오름차순으로 반환된다.',
  })
  splits!: PurchaseSupplyExpenseSplitDto[];
}

export class PurchaseSupplyResponseDto {
  @ApiProperty({ type: 'integer', example: 21, description: '구매 완료 처리된 물품 ID' })
  supplyId!: number;

  @ApiProperty({
    enum: SupplyStatus,
    enumName: 'SupplyStatus',
    example: SupplyStatus.PURCHASED,
  })
  status!: SupplyStatus;

  // nullable union이라 명시적 type 지정이 필요하다. (위 note와 동일한 이유)
  // ID는 정수이므로 number가 아닌 integer로 문서화한다.
  @ApiProperty({ type: 'integer', nullable: true, example: 88, description: '연결된 정산 ID' })
  linkedExpenseId!: number | null;

  @ApiProperty({ type: PurchaseSupplyLogDto, description: '기록된 상태 변경 이력' })
  log!: PurchaseSupplyLogDto;

  @ApiProperty({ type: PurchaseSupplyExpenseDto, description: '구매비로 생성된 정산 정보' })
  expense!: PurchaseSupplyExpenseDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-07-03T14:00:00Z',
    description: '물품 갱신 시각 (ISO 8601)',
  })
  updatedAt!: string;
}
