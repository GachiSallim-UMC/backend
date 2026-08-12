import { IsInt, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookExpenseDto {
  @ApiProperty({ description: '핀테크 고유 거래 ID (중복 처리 검증용 키)', example: 'TOSS_TX_20260703_9981' })
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @ApiProperty({ description: '실제 송금 완료된 금액', example: 30000 })
  @IsInt()
  @IsNotEmpty()
  amount!: number;
}