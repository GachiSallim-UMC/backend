import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJjdHkiOiJ...',
    description: '로그인 시 발급받은 Cognito refresh token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
