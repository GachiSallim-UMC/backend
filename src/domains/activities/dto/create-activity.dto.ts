import { IsInt, IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityLogType } from '@prisma/client';

export class CreateActivityDto {
  @ApiProperty({ description: '그룹 ID', example: 1 })
  @IsInt()
  @IsNotEmpty()
  groupId!: number;

  @ApiProperty({ description: '유저 ID', example: 2 })
  @IsInt()
  @IsNotEmpty()
  userId!: number;

  @ApiProperty({ 
    description: '활동 타입', 
    enum: ActivityLogType, 
    example: ActivityLogType.EXPENSE_CREATED 
  })
  @IsEnum(ActivityLogType)
  @IsNotEmpty()
  type!: ActivityLogType;

  @ApiPropertyOptional({ description: '연관 데이터 ID (선택)', example: 123 })
  @IsInt()
  @IsOptional()
  refId?: number;

  @ApiPropertyOptional({ 
    description: '활동 내용 설명 (선택)', 
    example: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.' 
  })
  @IsString()
  @IsOptional()
  description?: string;
}