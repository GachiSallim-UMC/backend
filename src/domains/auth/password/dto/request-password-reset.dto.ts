import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input = value as unknown;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 100 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(100)
  email!: string;
}

export class RequestPasswordResetResponseDto {
  @ApiProperty({
    description: '계정 존재 여부와 관계없이 요청이 접수되었음을 나타냅니다.',
    example: true,
  })
  accepted!: true;
}
