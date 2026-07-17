import { ApiProperty } from '@nestjs/swagger';

export class ShareRuleResponseDto {
  @ApiProperty({ example: 123, description: '공유한 생활 규칙 ID' })
  ruleId!: number;

  @ApiProperty({ example: 456, description: '생성된 채팅 메시지 ID' })
  messageId!: number;
}
