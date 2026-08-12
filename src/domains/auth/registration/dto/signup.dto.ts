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
    description:
      '8~16자. 영문 소문자·대문자·숫자를 각각 1개 이상 포함해야 하며 공백은 사용할 수 없습니다. 특수문자는 필수가 아니며 사용할 수 있습니다.',
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

  @ApiProperty({
    description: '추가 이메일 확인이 필요한지 여부입니다. 현재 일반 가입은 즉시 확인됩니다.',
    example: false,
  })
  confirmationRequired!: boolean;
}
