import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export class JoinGroupDto {
  @ApiProperty({ description: '초대코드', example: 'AB2CDEFH' })
  @IsString()
  @Length(8, 8)
  @Matches(INVITE_CODE_PATTERN)
  inviteCode!: string;
}
