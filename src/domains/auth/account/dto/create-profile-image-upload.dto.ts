import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const PROFILE_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type ProfileImageContentType = (typeof PROFILE_IMAGE_CONTENT_TYPES)[number];

export class CreateProfileImageUploadDto {
  @ApiProperty({
    enum: PROFILE_IMAGE_CONTENT_TYPES,
    example: 'image/jpeg',
    description: '업로드할 프로필 이미지 MIME 타입',
  })
  @IsIn(PROFILE_IMAGE_CONTENT_TYPES)
  contentType!: ProfileImageContentType;

  @ApiProperty({
    example: 824123,
    minimum: 1,
    maximum: PROFILE_IMAGE_MAX_FILE_SIZE,
    description: '업로드할 파일 크기(byte)',
  })
  @IsInt()
  @Min(1)
  @Max(PROFILE_IMAGE_MAX_FILE_SIZE)
  fileSize!: number;
}
