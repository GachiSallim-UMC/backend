import { IsInt, IsString, IsOptional, IsEnum, Min, IsArray, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExpenseCategory, SplitType } from '@prisma/client';

export class ExpenseParticipantDto {
  @ApiPropertyOptional({ description: '참여 유저 ID', example: '12' })
  @IsString()
  userId! : string;

  @ApiPropertyOptional({ description: 'CUSTOM 방식 시 해당 유저의 직접 입력 금액', example: 30000 })
  @IsInt()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ description: 'RATIO 방식 시 해당 유저의 비율(%)', example: 60 })
  @IsInt()
  @Min(0)
  @IsOptional()
  percentage?: number;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional({ description: '수정할 지출 항목명', example: '5월 관리비 수정' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '수정할 총 지출 금액 (1원 이상)', example: 95000 })
  @IsInt()
  @Min(1, { message: 'totalAmount는 1원 이상의 양수여야 합니다.' })
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional({ 
    description: '수정할 지출 카테고리', 
    enum: ExpenseCategory, 
    example: ExpenseCategory.FOOD 
  })
  @IsEnum(ExpenseCategory)
  @IsOptional()
  category?: ExpenseCategory;

  @ApiPropertyOptional({ 
    description: '수정할 분담 방식', 
    enum: SplitType, 
    example: SplitType.EQUAL 
  })
  @IsEnum(SplitType)
  @IsOptional()
  splitType?: SplitType;

  @ApiPropertyOptional({
    description: '수정할 정산 참여자 목록 (CUSTOM, RATIO 및 멤버 변경 시 사용)',
    type: [ExpenseParticipantDto],
    example: [
      { userId: '12', amount: 50000 },
      { userId: '2', amount: 45000 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  targetMemberIds?: ExpenseParticipantDto[];

  @ApiPropertyOptional({
    description: '수정할 영수증 이미지 URL',
    example: 'https://s3.amazonaws.com/receipt/123.jpg',
  })
  @IsString()
  @IsOptional()
  receiptUrl?: string;
}