import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

import { NICKNAME_PATTERN, PASSWORD_PATTERN } from '../../core/auth-validation.constant';

export class SignupDto {
  @ApiProperty({ example: 'example@gmail.com', maxLength: 100 })
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: 'Password1', minLength: 8, maxLength: 256 })
  @IsString()
  @Matches(PASSWORD_PATTERN)
  password!: string;

  @ApiProperty({ example: '길동', minLength: 2, maxLength: 10 })
  @IsString()
  @Matches(NICKNAME_PATTERN)
  nickname!: string;
}
