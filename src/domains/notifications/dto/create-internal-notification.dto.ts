import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_SAFE_ID = Number.MAX_SAFE_INTEGER;

export class CreateInternalNotificationDto {
  @ApiProperty({ example: 7, description: '알림 대상 사용자 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SAFE_ID)
  userId!: number;

  @ApiProperty({ example: 3, description: '호출자와 대상이 속한 그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SAFE_ID)
  groupId!: number;

  @ApiProperty({ enum: NotificationType, example: NotificationType.RULE_CHANGED })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiPropertyOptional({ example: 42, description: '관련 리소스 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SAFE_ID)
  refId?: number;

  @ApiProperty({ example: '생활 규칙이 변경되었습니다.', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(255)
  message!: string;
}
