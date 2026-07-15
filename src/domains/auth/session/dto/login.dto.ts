import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'example@gmail.com', description: '가입한 이메일' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password123', description: '비밀번호' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
