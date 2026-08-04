import { ApiProperty } from '@nestjs/swagger';

export class ReceiptImageViewResponseDto {
  @ApiProperty({
    description:
      '짧은 유효시간(5분) 동안만 접근 가능한 영수증 이미지 조회용 서명된 URL. 등록된 영수증 이미지가 없으면 null입니다.',
    nullable: true,
    example:
      'https://bucket.s3.ap-northeast-2.amazonaws.com/develop/receipts/1/7/550e8400-...jpg?X-Amz-Signature=...',
  })
  viewUrl!: string | null;

  @ApiProperty({ description: 'viewUrl 만료 시각. 영수증 이미지가 없으면 null입니다.', nullable: true, example: '2026-07-30T12:05:00.000Z' })
  expiresAt!: string | null;
}
