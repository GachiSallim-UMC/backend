import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class MarkReadDto {
  @ApiProperty({ description: '읽음 처리할 사용자 ID', example: '1' })
  @IsNumberString()
  userId!: string;
}
