import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { ConfigService } from '@nestjs/config';

import { AuthAccountService } from './account.service';
import { PROFILE_IMAGE_MAX_FILE_SIZE } from './dto/create-profile-image-upload.dto';
import { ProfileImageService } from './profile-image.service';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

describe('ProfileImageService', () => {
  const getOrThrow = jest.fn((key: string) => {
    const values: Record<string, string> = {
      PROFILE_IMAGE_BUCKET: 'profile-bucket',
      PROFILE_IMAGE_OBJECT_PREFIX: 'develop/profiles',
      PROFILE_IMAGE_PUBLIC_BASE_URL: 'https://images.example.com/',
    };
    return values[key];
  });
  const getAccount = jest.fn().mockResolvedValue({
    userId: 7,
    name: '홍길동',
    nickname: '길동',
    email: 'user@example.com',
    profileImage: null,
  });
  const s3 = {} as S3Client;
  const service = new ProfileImageService(
    { getOrThrow } as unknown as ConfigService,
    { getAccount } as unknown as AuthAccountService,
    s3,
  );
  const presign = jest.mocked(createPresignedPost);

  beforeEach(() => {
    jest.clearAllMocks();
    presign.mockResolvedValue({
      url: 'https://profile-bucket.s3.ap-northeast-2.amazonaws.com',
      fields: { key: 'signed-key', policy: 'signed-policy' },
    });
  });

  it('creates a user-scoped five-minute presigned POST', async () => {
    const result = await service.createUpload('cognito-sub', {
      contentType: 'image/jpeg',
      fileSize: 1024,
    });

    expect(getAccount).toHaveBeenCalledWith('cognito-sub');
    expect(presign).toHaveBeenCalledTimes(1);
    const options = presign.mock.calls[0][1];
    expect(presign.mock.calls[0][0]).toBe(s3);
    expect(options.Bucket).toBe('profile-bucket');
    expect(options.Key).toMatch(/^develop\/profiles\/7\/[0-9a-f-]+\.jpg$/);
    expect(options.Expires).toBe(300);
    expect(options.Conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg']);
    expect(options.Conditions).toContainEqual([
      'content-length-range',
      1,
      PROFILE_IMAGE_MAX_FILE_SIZE,
    ]);
    expect(result.uploadMethod).toBe('POST');
    expect(result.uploadUrl).toBe('https://profile-bucket.s3.ap-northeast-2.amazonaws.com');
    expect(result.fields).toEqual({ key: 'signed-key', policy: 'signed-policy' });
    expect(result.objectKey).toMatch(/^develop\/profiles\/7\/[0-9a-f-]+\.jpg$/);
    expect(result.profileImageUrl).toMatch(
      /^https:\/\/images\.example\.com\/develop\/profiles\/7\/[0-9a-f-]+\.jpg$/,
    );
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  });
});
