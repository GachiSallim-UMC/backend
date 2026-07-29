import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class TransferChatRoomOwnerDto {
  @ApiProperty({ description: '새로운 방장으로 지정할 사용자 ID', example: '2' })
  @IsNumberString()
  userId!: string;
}
