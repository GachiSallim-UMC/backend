import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ description: '초대할 사용자 ID', example: '2' })
  @IsNumberString()
  userId!: string;
}
