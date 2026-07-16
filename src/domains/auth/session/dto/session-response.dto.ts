import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'API 요청에 사용할 Cognito access token' })
  accessToken!: string;

  @ApiProperty({ description: '사용자 식별 정보가 포함된 Cognito ID token' })
  idToken!: string;

  @ApiProperty({ description: '세션 갱신에 사용할 Cognito refresh token' })
  refreshToken!: string;

  @ApiProperty({ example: 3600, description: 'Access token 만료까지 남은 초' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer', description: '토큰 유형' })
  tokenType!: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ description: 'API 요청에 사용할 새 Cognito access token' })
  accessToken!: string;

  @ApiProperty({ description: '새 Cognito ID token' })
  idToken!: string;

  @ApiProperty({ example: 3600, description: 'Access token 만료까지 남은 초' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer', description: '토큰 유형' })
  tokenType!: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true, description: '로그아웃 완료 여부' })
  signedOut!: true;
}
