import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN,
} from '../../common/password-policy.constants';

export class ChangePasswordDto {
  @ApiProperty({
    description: '현재 비밀번호 (최대 256자, 공백 불가)',
    example: 'CurrentPass1',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(/^\S+$/)
  previousPassword!: string;

  @ApiProperty({
    description: `새 비밀번호 (${AUTH_PASSWORD_MIN_LENGTH}~${AUTH_PASSWORD_MAX_LENGTH}자, 공백 없이 영문 대문자·소문자·숫자 포함)`,
    example: 'NewPassword1',
    minLength: AUTH_PASSWORD_MIN_LENGTH,
    maxLength: AUTH_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_PATTERN)
  newPassword!: string;
}
