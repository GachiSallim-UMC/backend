import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChoreStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Min } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListChoresQueryDto {
  @ApiProperty({ example: 1, description: '그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiPropertyOptional({ enum: ChoreStatus, description: '상태 필터' })
  @IsOptional()
  @IsEnum(ChoreStatus)
  status?: ChoreStatus;

  @ApiPropertyOptional({ example: 5, description: '담당자 ID 필터' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @ApiPropertyOptional({ example: '2026-08-10', description: '조회 시작일 (YYYY-MM-DD, 최대 7일 범위)' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'fromDate는 YYYY-MM-DD 형식이어야 합니다.' })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-08-16', description: '조회 종료일 (YYYY-MM-DD, 최대 7일 범위)' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'toDate는 YYYY-MM-DD 형식이어야 합니다.' })
  toDate?: string;
}