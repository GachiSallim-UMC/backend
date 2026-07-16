import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN,
} from '../../common/password-policy.constants';

function normalizeText({ value }: TransformFnParams): unknown {
  const input = value as unknown;

  return typeof input === 'string' ? input.trim() : input;
}

function normalizeEmail(params: TransformFnParams): unknown {
  const value = normalizeText(params);

  return typeof value === 'string' ? value.toLowerCase() : value;
}

export class SignupDto {
  @ApiProperty({ example: 'example@gmail.com', maxLength: 100 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @ApiProperty({
    example: 'Password123',
    minLength: AUTH_PASSWORD_MIN_LENGTH,
    maxLength: AUTH_PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  @MaxLength(AUTH_PASSWORD_MAX_LENGTH)
  @Matches(AUTH_PASSWORD_PATTERN, { message: 'password must satisfy the password policy' })
  password!: string;

  @ApiProperty({ example: '홍길동', minLength: 1, maxLength: 30 })
  @Transform(normalizeText)
  @IsString()
  @Length(1, 30)
  name!: string;

  @ApiProperty({ example: '길동', minLength: 2, maxLength: 10 })
  @Transform(normalizeText)
  @IsString()
  @Length(2, 10)
  @Matches(/^[\p{L}\p{N}]+$/u, { message: 'nickname must contain only letters and numbers' })
  nickname!: string;
}

export class SignupResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: 'example@gmail.com' })
  email!: string;

  @ApiProperty({ example: true })
  confirmationRequired!: true;
}
