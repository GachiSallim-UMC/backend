import { randomUUID } from 'node:crypto';

import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CreateProfileImageUploadDto,
  PROFILE_IMAGE_MAX_FILE_SIZE,
  ProfileImageContentType,
} from './dto/create-profile-image-upload.dto';
import { ProfileImageUploadResponseDto } from './dto/profile-image-upload-response.dto';
import { PROFILE_IMAGE_S3_CLIENT } from './profile-image.constants';
import { AuthAccountService } from './account.service';

const PROFILE_IMAGE_UPLOAD_EXPIRES_SECONDS = 5 * 60;
const PROFILE_IMAGE_EXTENSIONS: Record<ProfileImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ProfileImageService {
  constructor(
    private readonly config: ConfigService,
    private readonly accountService: AuthAccountService,
    @Inject(PROFILE_IMAGE_S3_CLIENT) private readonly s3: S3Client,
  ) {}

  async createUpload(
    cognitoSub: string,
    dto: CreateProfileImageUploadDto,
  ): Promise<ProfileImageUploadResponseDto> {
    const account = await this.accountService.getAccount(cognitoSub);
    const bucket = this.config.getOrThrow<string>('PROFILE_IMAGE_BUCKET');
    const objectPrefix = this.config
      .getOrThrow<string>('PROFILE_IMAGE_OBJECT_PREFIX')
      .replace(/^\/+|\/+$/g, '');
    const publicBaseUrl = this.config
      .getOrThrow<string>('PROFILE_IMAGE_PUBLIC_BASE_URL')
      .replace(/\/+$/g, '');
    const extension = PROFILE_IMAGE_EXTENSIONS[dto.contentType];
    const objectKey = `${objectPrefix}/${account.userId}/${randomUUID()}.${extension}`;
    const expiresAt = new Date(Date.now() + PROFILE_IMAGE_UPLOAD_EXPIRES_SECONDS * 1000);
    const upload = await createPresignedPost(this.s3, {
      Bucket: bucket,
      Key: objectKey,
      Expires: PROFILE_IMAGE_UPLOAD_EXPIRES_SECONDS,
      Fields: {
        'Content-Type': dto.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      Conditions: [
        ['eq', '$Content-Type', dto.contentType],
        ['eq', '$Cache-Control', 'public, max-age=31536000, immutable'],
        ['content-length-range', 1, PROFILE_IMAGE_MAX_FILE_SIZE],
      ],
    });

    return {
      uploadMethod: 'POST',
      uploadUrl: upload.url,
      fields: upload.fields,
      objectKey,
      profileImageUrl: `${publicBaseUrl}/${objectKey}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
