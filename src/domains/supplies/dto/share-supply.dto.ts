import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ShareSupplyDto {
  @ApiProperty({ example: 3, description: '공유할 대상 채팅방 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chatRoomId!: number;

  @ApiPropertyOptional({
    example: '화장지 다 떨어졌어요. 구매 부탁해요',
    description: '카드와 함께 보낼 메시지 (최대 255자)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  content?: string;
}
