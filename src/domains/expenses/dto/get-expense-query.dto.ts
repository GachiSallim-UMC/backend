import { IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetExpenseQueryDto {
  @ApiProperty({ description: '그룹 ID', example: 1 })
  @IsInt()
  @Type(() => Number)
  groupId!: number;

  @ApiPropertyOptional({ description: '필터링할 카테고리 ID', example: 2 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({ description: '필터링할 선지불자 유저 ID', example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  userId?: number;
}