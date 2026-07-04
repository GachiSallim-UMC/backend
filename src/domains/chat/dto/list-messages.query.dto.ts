import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumberString, IsOptional, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ description: '이 메시지 ID보다 이전 메시지를 조회', example: '100' })
  @IsOptional()
  @IsNumberString()
  before?: string;

  @ApiPropertyOptional({ description: '조회 개수', example: 30, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}
