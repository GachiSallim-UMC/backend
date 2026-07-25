import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'example@gmail.com', description: '가입한 이메일' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Password123',
    description:
      '가입 시 설정한 비밀번호. 8~16자이며 영문 소문자·대문자·숫자를 각각 1개 이상 포함하고 공백은 사용할 수 없습니다. 특수문자는 필수가 아니며 사용할 수 있습니다.',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
