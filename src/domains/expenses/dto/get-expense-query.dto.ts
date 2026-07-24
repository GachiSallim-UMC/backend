import { IsInt, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExpenseCategory } from '@prisma/client';

export class GetExpenseQueryDto {
  @ApiProperty({ description: '그룹 ID', example: 1 })
  @IsInt()
  @Type(() => Number)
  groupId!: number;

  @ApiPropertyOptional({ 
    description: '필터링할 지출 카테고리', 
    enum: ExpenseCategory, 
    example: ExpenseCategory.FOOD 
  })
  @IsEnum(ExpenseCategory)
  @IsOptional()
  category?: ExpenseCategory;

  @ApiPropertyOptional({ description: '필터링할 선지불자 유저 ID', example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  userId?: number;
}