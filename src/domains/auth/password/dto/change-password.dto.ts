import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { PASSWORD_PATTERN } from '../../core/auth-validation.constant';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword1', format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  previousPassword!: string;

  @ApiProperty({
    example: 'NewPassword2',
    format: 'password',
    minLength: 8,
    maxLength: 256,
    description: '8자 이상이며 영문 대문자, 소문자, 숫자를 각각 포함해야 합니다.',
  })
  @IsString()
  @Matches(PASSWORD_PATTERN, {
    message:
      'newPassword must be at least 8 characters and include uppercase, lowercase, and number',
  })
  newPassword!: string;
}
