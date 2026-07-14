import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

const CARD_MESSAGE_TYPES = [
  MessageType.CARD_CHORE,
  MessageType.CARD_EXPENSE,
  MessageType.CARD_SUPPLY,
  MessageType.CARD_RULE,
] as const;

export type CardMessageType = (typeof CARD_MESSAGE_TYPES)[number];

export class CreateCardMessageDto {
  @ApiProperty({ description: '발신자(사용자) ID', example: '1' })
  @IsNumberString()
  senderId!: string;

  @ApiProperty({ description: '카드 메시지 타입', enum: CARD_MESSAGE_TYPES, example: MessageType.CARD_CHORE })
  @IsEnum(CARD_MESSAGE_TYPES)
  type!: CardMessageType;

  @ApiProperty({ description: '참조 도메인(집안일/정산/생필품/규칙) ID', example: '10' })
  @IsNumberString()
  refId!: string;

  @ApiPropertyOptional({ description: '카드와 함께 보낼 메시지', example: '이거 확인해주세요' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  content?: string;
}
