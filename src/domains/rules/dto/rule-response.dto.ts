import { ApiProperty } from '@nestjs/swagger';

export class RuleResponseDto {
  @ApiProperty({ example: 1, description: '생활 규칙 ID' })
  ruleId!: number;

  @ApiProperty({ example: '분리수거는 화요일에 하기', description: '생활 규칙 제목' })
  title!: string;
}