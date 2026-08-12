import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SettleSplitDto {
  @ApiPropertyOptional({
    description:
      'true(기본값) 또는 미전달 시 완료(DONE) 처리, false를 명시적으로 보내면 요청 상태(REQUESTED)로 되돌립니다.',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isBulkComplete?: boolean;
}