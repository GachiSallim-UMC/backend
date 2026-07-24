import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListSuppliesQueryDto {
  @ApiProperty({ example: 1, description: '그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiPropertyOptional({ enum: SupplyStatus, description: '상태 필터 (SUFFICIENT/LOW/EMPTY/PURCHASED)' })
  @IsOptional()
  @IsEnum(SupplyStatus)
  status?: SupplyStatus;
}
