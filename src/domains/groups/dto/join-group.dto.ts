import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinGroupDto {
  @ApiProperty({ description: '초대코드', example: 'AB12CD34' })
  @IsString()
  @Length(1, 10)
  inviteCode!: string;
}
