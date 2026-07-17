import { IsInt, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExpenseDto {
  @ApiPropertyOptional({ description: '수정할 지출 항목명', example: '5월 관리비 수정' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '수정할 총 지출 금액', example: 95000 })
  @IsInt()
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional({ description: '수정할 카테고리 ID', example: 3 })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiPropertyOptional({ 
    description: '수정할 분담 방식', 
    enum: ['EQUAL', 'RATIO', 'CUSTOM'], 
    example: 'EQUAL' 
  })
  @IsEnum(['EQUAL', 'RATIO', 'CUSTOM'])
  @IsOptional()
  splitType?: 'EQUAL' | 'RATIO' | 'CUSTOM';
}