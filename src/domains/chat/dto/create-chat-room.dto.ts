import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatRoomDto {
  @ApiProperty({ description: '그룹 ID', example: '1' })
  @IsNumberString()
  groupId!: string;

  @ApiProperty({ description: '채팅방 이름', example: '같이살림방' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
