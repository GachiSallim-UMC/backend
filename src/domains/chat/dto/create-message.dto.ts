import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({ description: '발신자(사용자) ID', example: '1' })
  @IsNumberString()
  senderId!: string;

  @ApiProperty({ description: '메시지 내용', example: '안녕하세요' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
