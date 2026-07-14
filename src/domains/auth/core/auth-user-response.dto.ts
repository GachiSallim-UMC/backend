import { ApiProperty } from '@nestjs/swagger';

import { AuthenticatedUser } from './auth-context.interface';

export class AuthUserResponseDto {
  @ApiProperty({ example: '1' })
  id!: string;

  @ApiProperty({ example: 'example@gmail.com' })
  email!: string;

  @ApiProperty({ example: '길동' })
  nickname!: string;

  @ApiProperty({ example: 'https://example.com/profile.png', nullable: true, required: false })
  profileImage!: string | null;

  @ApiProperty({ example: '2026-07-14T00:00:00.000Z' })
  createdAt!: string;
}

export const toAuthUserResponse = (user: AuthenticatedUser): AuthUserResponseDto => ({
  id: user.id.toString(),
  email: user.email,
  nickname: user.nickname,
  profileImage: user.profileImage,
  createdAt: user.createdAt.toISOString(),
});
