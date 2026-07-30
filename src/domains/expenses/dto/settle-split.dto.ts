import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SettleSplitDto {
  @ApiPropertyOptional({
    description:
      '다른 분담자가 아직 완료되지 않았어도 상위 정산을 강제로 완료 처리할지 여부 (기본값: false). ' +
      '대상 분담(split)은 이 값과 무관하게 항상 완료(DONE) 상태로 전이됩니다.',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isBulkComplete?: boolean;
}