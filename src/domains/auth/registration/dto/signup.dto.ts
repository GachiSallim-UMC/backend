import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 'Password123', minLength: 8, maxLength: 256 })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  @Matches(/[a-z]/, { message: 'password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'password must contain an uppercase letter' })
  @Matches(/\d/, { message: 'password must contain a number' })
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
