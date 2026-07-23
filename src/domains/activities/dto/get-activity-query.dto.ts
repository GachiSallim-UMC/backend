import { IsInt, IsOptional, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityLogType } from '@prisma/client';

export class GetActivityQueryDto {
  @ApiProperty({ description: '그룹 ID', example: 1 })
  @IsInt()
  @Type(() => Number)
  groupId!: number;

  @ApiPropertyOptional({ description: '활동 타입 필터', enum: ActivityLogType })
  @IsEnum(ActivityLogType)
  @IsOptional()
  type?: ActivityLogType;

  @ApiPropertyOptional({ description: '유저 ID 필터', example: 2 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  userId?: number;

  // Swagger 문서에 최소값(minimum: 1) 명시
  @ApiPropertyOptional({ description: '페이지 번호', default: 1, example: 1, minimum: 1 })
  @IsInt()
  @Min(1) // 페이지 번호 최소값을 1로 제한 (0 이하 값 요청 시 Validation error)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;
}