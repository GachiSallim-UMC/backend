import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSupplyStatusDto {
  // 전체 enum을 허용해 검증을 통과시키고, PURCHASED는 서비스에서 스펙 메시지로 400 처리
  @ApiProperty({
    enum: [SupplyStatus.SUFFICIENT, SupplyStatus.LOW, SupplyStatus.EMPTY],
    example: SupplyStatus.LOW,
    description: '변경할 상태 (SUFFICIENT/LOW/EMPTY만 허용, PURCHASED는 /purchase에서 처리)',
  })
  @IsEnum(SupplyStatus)
  status!: SupplyStatus;

  @ApiPropertyOptional({ example: '다음 주 안에 구매 필요', description: '변경 사유 메모 (최대 255자)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
