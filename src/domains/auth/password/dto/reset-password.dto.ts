import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN,
} from '../../common/password-policy.constants';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input = value as unknown;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 100 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @Matches(/^\d{6}$/)
  confirmationCode!: string;

  @ApiProperty({
    description: `새 비밀번호 (${AUTH_PASSWORD_MIN_LENGTH}~${AUTH_PASSWORD_MAX_LENGTH}자, 공백 없이 영문 대문자·소문자·숫자 포함)`,
    example: 'NewPassword1',
    minLength: AUTH_PASSWORD_MIN_LENGTH,
    maxLength: AUTH_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_PATTERN)
  newPassword!: string;
}

export class ResetPasswordResponseDto {
  @ApiProperty({ example: true })
  reset!: true;
}
