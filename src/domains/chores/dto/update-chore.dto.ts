import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChoreCategory, RepeatType, Weekday } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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

  @ApiProperty({
    enum: ChoreCategory,
    example: ChoreCategory.TRASH,
    description:
      '집안일 카테고리. CLEANING(청소), DISHWASHING(설거지), LAUNDRY(세탁), TRASH(쓰레기/분리수거), TIDYING(정리정돈), SHOPPING(장보기/물품관리), COOKING(요리/식사), PET_PLANT(반려동물/식물), ETC(기타)',
  })
  @IsEnum(ChoreCategory)
  category!: ChoreCategory;

  @ApiProperty({ example: 6, description: '담당자 사용자 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;

  @ApiProperty({ example: '2026-07-04', description: '시작일 (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    example: '2026-07-06',
    description: '종료일 (YYYY-MM-DD). 선택 항목이며 생략 시 종료일이 비워집니다.',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: RepeatType, example: RepeatType.WEEKLY })
  @IsOptional()
  @IsEnum(RepeatType)
  repeatType?: RepeatType;

  @ApiPropertyOptional({
    enum: Weekday,
    isArray: true,
    example: [Weekday.MON, Weekday.THU],
    description: '반복 요일. repeatType이 WEEKLY일 때만 사용하며 최소 1개 이상 필요합니다.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsEnum(Weekday, { each: true })
  repeatDays?: Weekday[];

  @ApiPropertyOptional({ example: '분리수거는 화요일 밤에', description: '메모 (최대 255자)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;
}
