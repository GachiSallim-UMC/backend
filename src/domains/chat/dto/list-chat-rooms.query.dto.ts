import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class ListChatRoomsQueryDto {
  @ApiProperty({ description: '그룹 ID', example: '1' })
  @IsNumberString()
  groupId!: string;
}
