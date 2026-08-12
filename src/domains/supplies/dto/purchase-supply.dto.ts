import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

// category/amount 누락 시 각각 다른 에러코드(SUP_400_CATEGORY / COMMON_INVALID_PARAMETER)를
// 반환해야 하므로, DTO에서는 optional로 두고 서비스에서 순서대로 필수 검증한다.
export class PurchaseSupplyDto {
  @ApiProperty({
    enum: ExpenseCategory,
    example: ExpenseCategory.SHOPPING,
    description: '정산 카테고리 (필수). FOOD(식비), SHOPPING(쇼핑), UTILITIES(공과금), ETC(기타)',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiProperty({ example: 8900, description: '구매 금액 (필수, 원 단위)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;
}
