import { ApiProperty } from '@nestjs/swagger';

export class AuthAccountResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: '홍길동' })
  name!: string;

  @ApiProperty({ example: '길동' })
  nickname!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'https://example.com/profile.png', nullable: true })
  profileImage!: string | null;
}
