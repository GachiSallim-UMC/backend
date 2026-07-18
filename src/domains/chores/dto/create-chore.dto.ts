import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RepeatType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChoreDto {
  @ApiProperty({ example: 1, description: '그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiProperty({ example: '설거지', description: '집안일 제목 (최대 100자)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: 5, description: '담당자 사용자 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;

  @ApiProperty({ example: '2026-07-03', description: '시작일 (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-07-05', description: '마감일 (YYYY-MM-DD)' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ enum: RepeatType, example: RepeatType.DAILY, default: RepeatType.NONE })
  @IsOptional()
  @IsEnum(RepeatType)
  repeatType?: RepeatType = RepeatType.NONE;
}