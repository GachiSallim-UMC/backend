import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input = value as unknown;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class ConfirmSignupDto {
  @ApiProperty({ example: 'example@gmail.com', maxLength: 100 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @Matches(/^\d{6}$/)
  confirmationCode!: string;
}

export class ConfirmSignupResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: 'example@gmail.com' })
  email!: string;

  @ApiProperty({ example: true })
  confirmed!: true;
}
