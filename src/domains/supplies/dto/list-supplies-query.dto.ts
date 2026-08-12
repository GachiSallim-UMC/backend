import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyCategory, SupplyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListSuppliesQueryDto {
  @ApiProperty({ example: 1, description: '그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiPropertyOptional({
    enum: SupplyStatus,
    description: '상태 필터 (SUFFICIENT/LOW/EMPTY/PURCHASED)',
  })
  @IsOptional()
  @IsEnum(SupplyStatus)
  status?: SupplyStatus;

  @ApiPropertyOptional({ enum: SupplyCategory, description: '카테고리 필터' })
  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;
}
