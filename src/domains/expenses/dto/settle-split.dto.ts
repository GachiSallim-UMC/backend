import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SettleSplitDto {
  @ApiPropertyOptional({ description: '일괄 정산 완료 처리 여부 (기본값: false)', example: false })
  @IsBoolean()
  @IsOptional()
  isBulkComplete?: boolean;
}