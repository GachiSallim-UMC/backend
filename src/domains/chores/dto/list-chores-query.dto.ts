import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChoreStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

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
}