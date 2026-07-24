import { ApiProperty } from '@nestjs/swagger';

export class VapidPublicKeyResponseDto {
  @ApiProperty({
    description: 'PushManager.subscribe의 applicationServerKey에 사용할 VAPID 공개 키',
    example: 'BExampleUrlSafeBase64PublicKey',
  })
  publicKey!: string;
}
