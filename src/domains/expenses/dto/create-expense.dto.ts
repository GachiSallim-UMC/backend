import { IsString, IsNumber, IsArray, IsOptional, IsEnum, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';

// Prisma의 ExpenseCategory Enum을 다시 export하여 다른 파일에서도 공통 사용 가능하도록 처리
export { ExpenseCategory };

export enum SplitType {
  EQUAL = 'EQUAL',
  EXACT = 'EXACT',
  PERCENTAGE = 'PERCENTAGE',
}

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
    example: SplitType.EQUAL 
  })
  @IsEnum(SplitType)
  @IsNotEmpty()
  splitType!: SplitType;

  @ApiProperty({ 
    description: '지출 카테고리', 
    enum: ExpenseCategory, 
    example: ExpenseCategory.FOOD 
  })
  @IsEnum(ExpenseCategory)
  @IsNotEmpty()
  category!: ExpenseCategory;

  @ApiProperty({ 
    description: '분담 대상 유저 ID 목록', 
    type: [String], 
    example: ['12', '13'] 
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  targetMemberIds!: string[];

  @ApiPropertyOptional({ description: '메모/비고', example: '이마트에서 장본 내역' })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({ 
    description: '영수증 이미지 URL', 
    example: 'https://s3.amazonaws.com/receipt/123.jpg' 
  })
  @IsString()
  @IsOptional()
  receiptUrl?: string;
}