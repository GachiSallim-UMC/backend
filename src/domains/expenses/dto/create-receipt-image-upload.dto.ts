import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsPositive, Max, Min } from 'class-validator';

export const RECEIPT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const RECEIPT_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024;

export type ReceiptImageContentType = (typeof RECEIPT_IMAGE_CONTENT_TYPES)[number];

export class CreateReceiptImageUploadDto {
  @ApiProperty({
    description: '영수증을 첨부할 지출이 속한 그룹 ID (그룹 멤버만 업로드 가능)',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  groupId!: number;

  @ApiProperty({
    enum: RECEIPT_IMAGE_CONTENT_TYPES,
    example: 'image/jpeg',
    description: '업로드할 영수증 이미지 MIME 타입',
  })
  @IsIn(RECEIPT_IMAGE_CONTENT_TYPES)
  contentType!: ReceiptImageContentType;

  @ApiProperty({
    example: 1824123,
    minimum: 1,
    maximum: RECEIPT_IMAGE_MAX_FILE_SIZE,
    description: '업로드할 파일 크기(byte)',
  })
  @IsInt()
  @Min(1)
  @Max(RECEIPT_IMAGE_MAX_FILE_SIZE)
  fileSize!: number;
}
