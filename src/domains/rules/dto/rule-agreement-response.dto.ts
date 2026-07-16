import { ApiProperty } from '@nestjs/swagger';

export class RuleAgreementResponseDto {
  @ApiProperty({ example: 15, description: '규칙 동의 ID' })
  agreementId!: number;

  @ApiProperty({ example: 123, description: '생활 규칙 ID' })
  ruleId!: number;

  @ApiProperty({ example: 5, description: '사용자 ID' })
  userId!: number;

  @ApiProperty({
    enum: ['AGREED', 'DISAGREED', 'PENDING'],
    example: 'AGREED',
    description: '규칙 동의 상태',
  })
  status!: string;

  @ApiProperty({
    example: '2026-07-03T13:30:00.000Z',
    nullable: true,
    description: '확인 일시. PENDING 상태이면 null',
  })
  confirmedAt!: string | null;
}
