import { IsInt, IsString, IsOptional, IsEnum, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, SplitType } from '@prisma/client';

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
}