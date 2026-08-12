import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNumberString } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ description: '초대할 사용자 ID 목록', type: [String], example: ['2', '3'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumberString({}, { each: true })
  userIds!: string[];
}
