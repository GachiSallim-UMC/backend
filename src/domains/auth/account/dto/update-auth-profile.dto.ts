import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';

import { NICKNAME_PATTERN } from '../../core/auth-validation.constant';

export class UpdateAuthProfileDto {
  @ApiProperty({ example: '길동', required: false, minLength: 2, maxLength: 10 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(NICKNAME_PATTERN)
  nickname?: string;

  @ApiProperty({
    example: 'https://example.com/profile.png',
    required: false,
    nullable: true,
    maxLength: 512,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  profileImage?: string | null;
}
