import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum RuleStatusFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class ListRulesQueryDto {
  @ApiPropertyOptional({ example: 1, description: '공동생활 그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiPropertyOptional({
    enum: RuleStatusFilter,
    example: RuleStatusFilter.ACTIVE,
    description: '규칙 활성 상태 필터',
  })
  @IsOptional()
  @IsEnum(RuleStatusFilter)
  status?: RuleStatusFilter;
}