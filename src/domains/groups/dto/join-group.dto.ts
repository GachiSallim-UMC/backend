import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export class JoinGroupDto {
  @ApiProperty({ description: '초대코드', example: 'AB2CDE' })
  @IsString()
  @Length(6, 6)
  @Matches(INVITE_CODE_PATTERN)
  inviteCode!: string;
}
