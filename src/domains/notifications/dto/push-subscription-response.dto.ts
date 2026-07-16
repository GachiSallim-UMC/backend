import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PushSubscriptionResponseDto {
  @ApiProperty({ example: 15 })
  subscriptionId!: number;

  @ApiProperty({ example: 'https://push.example.com/subscriptions/device-token' })
  endpoint!: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0', nullable: true })
  userAgent!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ example: '2026-07-16T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-16T09:00:00.000Z' })
  updatedAt!: string;
}
