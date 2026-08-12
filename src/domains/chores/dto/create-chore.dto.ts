import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChoreCategory, CustomOption, RepeatType, Weekday } from '@prisma/client';
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
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REPEAT_INTERVAL_MIN = 1;
export const REPEAT_INTERVAL_MAX = 99;

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

  @ApiProperty({
    enum: ChoreCategory,
    example: ChoreCategory.DISHWASHING,
    description:
      '집안일 카테고리. CLEANING(청소), DISHWASHING(설거지), LAUNDRY(세탁), TRASH(쓰레기/분리수거), TIDYING(정리정돈), SHOPPING(장보기/물품관리), COOKING(요리/식사), PET_PLANT(반려동물/식물), ETC(기타)',
  })
  @IsEnum(ChoreCategory)
  category!: ChoreCategory;

  @ApiProperty({ example: 5, description: '담당자 사용자 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;

  @ApiProperty({ example: '2026-07-03', description: '시작일 (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    example: '2026-07-05',
    description: '종료일 (YYYY-MM-DD). 선택 항목이며 생략 시 종료일 없는 집안일로 등록됩니다.',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({
    enum: RepeatType,
    example: RepeatType.NONE,
    description:
      '반복 유형 (필수). NONE(일회성), DAILY(매일), WEEKLY(매주), MONTHLY(매월), CUSTOM(사용자 정의)',
  })
  @IsEnum(RepeatType)
  repeatType!: RepeatType;

  @ApiPropertyOptional({
    enum: CustomOption,
    example: CustomOption.EVERY_N_WEEKS,
    description:
      '사용자 정의 반복 방식. repeatType이 CUSTOM일 때만 사용하며 이때 필수입니다. ' +
      'EVERY_N_DAYS(N일마다), EVERY_N_WEEKS(N주마다), EVERY_N_MONTHS(N개월마다), SPECIFIC_DAYS(특정 요일)',
  })
  @IsOptional()
  @IsEnum(CustomOption)
  customOption?: CustomOption;

  @ApiPropertyOptional({
    example: 2,
    minimum: REPEAT_INTERVAL_MIN,
    maximum: REPEAT_INTERVAL_MAX,
    description:
      '반복 주기 N. customOption이 EVERY_N_DAYS/EVERY_N_WEEKS/EVERY_N_MONTHS일 때만 사용하며 이때 필수입니다.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(REPEAT_INTERVAL_MIN)
  @Max(REPEAT_INTERVAL_MAX)
  repeatInterval?: number;

  @ApiPropertyOptional({
    enum: Weekday,
    isArray: true,
    example: [Weekday.MON, Weekday.THU],
    description:
      '반복 요일. repeatType이 WEEKLY이거나 customOption이 SPECIFIC_DAYS일 때만 사용하며 이때 최소 1개 이상 필요합니다.',
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
