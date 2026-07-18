import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RepeatType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateChoreDto {
  @ApiProperty({ example: '설거지 및 분리수거', description: '집안일 제목 (최대 100자)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: 6, description: '담당자 사용자 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;

  @ApiProperty({ example: '2026-07-04', description: '시작일 (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-07-06', description: '마감일 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: RepeatType, example: RepeatType.WEEKLY })
  @IsOptional()
  @IsEnum(RepeatType)
  repeatType?: RepeatType;
}
