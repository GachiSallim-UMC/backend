import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: '현재 비밀번호',
    example: 'CurrentPass1',
  })
  @IsString()
  @IsNotEmpty()
  previousPassword!: string;

  @ApiProperty({
    description: '새 비밀번호 (8자 이상, 영문 대문자·소문자·숫자 포함)',
    example: 'NewPassword1',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}
