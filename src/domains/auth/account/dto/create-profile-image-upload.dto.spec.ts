import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateProfileImageUploadDto,
  PROFILE_IMAGE_MAX_FILE_SIZE,
} from './create-profile-image-upload.dto';

describe('CreateProfileImageUploadDto', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts the supported %s MIME type',
    async (contentType) => {
      const dto = plainToInstance(CreateProfileImageUploadDto, {
        contentType,
        fileSize: PROFILE_IMAGE_MAX_FILE_SIZE,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects SVG files and files larger than 5MB', async () => {
    const dto = plainToInstance(CreateProfileImageUploadDto, {
      contentType: 'image/svg+xml',
      fileSize: PROFILE_IMAGE_MAX_FILE_SIZE + 1,
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['contentType', 'fileSize']),
    );
  });
});
