import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({ description: '메시지 내용', example: '안녕하세요' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
