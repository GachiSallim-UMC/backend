import { ApiProperty } from '@nestjs/swagger';

export class ReceiptImageUploadResponseDto {
  @ApiProperty({ example: 'POST' })
  uploadMethod!: 'POST';

  @ApiProperty({ example: 'https://bucket.s3.ap-northeast-2.amazonaws.com' })
  uploadUrl!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      key: 'develop/receipts/1/7/550e8400-e29b-41d4-a716-446655440000.jpg',
      'Content-Type': 'image/jpeg',
      policy: 'base64-policy',
      'x-amz-signature': 'signature',
    },
  })
  fields!: Record<string, string>;

  @ApiProperty({
    description:
      'S3 오브젝트 키. 공개적으로 접근 가능한 URL이 아니며, 비용 등록/수정 API의 receiptUrl 값으로 그대로 전달해야 합니다. 실제 조회는 GET /expenses/:expenseId/receipt-image로만 가능합니다.',
    example: 'develop/receipts/1/7/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  objectKey!: string;

  @ApiProperty({ example: '2026-07-30T12:05:00.000Z' })
  expiresAt!: string;
}
