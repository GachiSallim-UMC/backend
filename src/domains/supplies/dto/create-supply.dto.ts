import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyCategory, SupplyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// 등록 시 지정 가능한 상태값 (PURCHASED는 구매 완료 API에서만 처리)
export const CREATABLE_SUPPLY_STATUSES = [
  SupplyStatus.SUFFICIENT,
  SupplyStatus.LOW,
  SupplyStatus.EMPTY,
] as const;

export class CreateSupplyDto {
  @ApiProperty({ example: 1, description: '그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiProperty({ example: '화장지', description: '물품명 (최대 100자)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    enum: SupplyCategory,
    example: SupplyCategory.DAILY_NECESSITIES,
    description: '물품 카테고리 (필수)',
  })
  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @ApiPropertyOptional({
    enum: CREATABLE_SUPPLY_STATUSES,
    example: SupplyStatus.SUFFICIENT,
    default: SupplyStatus.SUFFICIENT,
    description: '초기 상태 (SUFFICIENT/LOW/EMPTY만 허용, PURCHASED 불가)',
  })
  @IsOptional()
  @IsIn(CREATABLE_SUPPLY_STATUSES)
  status?: (typeof CREATABLE_SUPPLY_STATUSES)[number] = SupplyStatus.SUFFICIENT;

  @ApiPropertyOptional({ example: 5, description: '담당자 사용자 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @ApiPropertyOptional({
    example: '매달 구매, 마트에서 대용량으로 구입',
    description: '메모 (최대 255자)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;
}
