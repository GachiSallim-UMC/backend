import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

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
    description: '새 비밀번호 (8~16자, 공백 없이 영문 대문자·소문자·숫자 포함)',
    example: 'NewPassword1',
    minLength: 8,
    maxLength: 16,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Matches(/^\S+$/)
  newPassword!: string;
}
