import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input = value as unknown;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class ResendSignupEmailDto {
  @ApiProperty({ example: 'example@gmail.com', maxLength: 100 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(100)
  email!: string;
}

export class ResendSignupEmailResponseDto {
  @ApiProperty({ example: 'example@gmail.com' })
  email!: string;

  @ApiProperty({ example: true })
  resent!: true;
}
