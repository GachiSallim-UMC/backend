import { ApiProperty } from '@nestjs/swagger';

export class ProfileImageUploadResponseDto {
  @ApiProperty({ example: 'POST' })
  uploadMethod!: 'POST';

  @ApiProperty({ example: 'https://bucket.s3.ap-northeast-2.amazonaws.com' })
  uploadUrl!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      key: 'develop/profiles/7/550e8400-e29b-41d4-a716-446655440000.jpg',
      'Content-Type': 'image/jpeg',
      policy: 'base64-policy',
      'x-amz-signature': 'signature',
    },
  })
  fields!: Record<string, string>;

  @ApiProperty({
    example: 'develop/profiles/7/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  objectKey!: string;

  @ApiProperty({
    example:
      'https://bucket.s3.ap-northeast-2.amazonaws.com/develop/profiles/7/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  profileImageUrl!: string;

  @ApiProperty({ example: '2026-07-28T12:05:00.000Z' })
  expiresAt!: string;
}
