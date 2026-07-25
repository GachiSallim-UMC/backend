import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  Min,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, SplitType } from '@prisma/client';

// Prisma의 ExpenseCategory Enum을 다시 export하여 다른 파일에서도 공통 사용 가능하도록 처리
export { ExpenseCategory };


// 1. 참여자별 개별 분담 정보 DTO (EXACT / PERCENTAGE 분담 시 사용)
export class ExpenseParticipantDto {
  @ApiProperty({ description: '분담 대상 유저 ID', example: '12' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({
    description: '개별 분담 금액 (EXACT 방식 시 필수)',
    example: 15000,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: '개별 분담 비율 (PERCENTAGE 방식 시 필수, 0~100)',
    example: 50,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  percentage?: number;
}

// 2. 지출 생성 메인 DTO
export class CreateExpenseDto {
  @ApiPropertyOptional({ description: '그룹 ID (미입력 시 기본 그룹으로 설정)', example: 1 })
  @IsNumber()
  @IsOptional()
  groupId?: number;

  @ApiProperty({ description: '지출 항목명', example: '장보기 비용' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: '총 지출 금액 (1원 이상)', example: 30000 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amount!: number;

  @ApiProperty({ description: '선결제자 유저 ID', example: '12' })
  @IsString()
  @IsNotEmpty()
  payerId!: string;

  @ApiProperty({ description: '지출 일자 (YYYY-MM-DD)', example: '2026-07-23' })
  @IsString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({
    description: '분담 방식',
    enum: SplitType,
    example: SplitType.EQUAL,
  })
  @IsEnum(SplitType)
  @IsNotEmpty()
  splitType!: SplitType;

  @ApiProperty({
    description: '지출 카테고리',
    enum: ExpenseCategory,
    example: ExpenseCategory.FOOD,
  })
  @IsEnum(ExpenseCategory)
  @IsNotEmpty()
  category!: ExpenseCategory;

  @ApiProperty({
    description: '분담 대상 상세 목록 (유저 ID 및 EXACT/PERCENTAGE 상세 분담 정보)',
    type: [ExpenseParticipantDto],
    example: [
      { userId: '12', amount: 15000, percentage: 50 },
      { userId: '13', amount: 15000, percentage: 50 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  @IsNotEmpty()
  targetMemberIds!: ExpenseParticipantDto[];

  @ApiPropertyOptional({ description: '메모/비고', example: '이마트에서 장본 내역' })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({
    description: '영수증 이미지 URL',
    example: 'https://s3.amazonaws.com/receipt/123.jpg',
  })
  @IsString()
  @IsOptional()
  receiptUrl?: string;
}