import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateReceiptImageUploadDto,
  RECEIPT_IMAGE_MAX_FILE_SIZE,
} from './create-receipt-image-upload.dto';

describe('CreateReceiptImageUploadDto', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts the supported %s MIME type',
    async (contentType) => {
      const dto = plainToInstance(CreateReceiptImageUploadDto, {
        groupId: 1,
        contentType,
        fileSize: RECEIPT_IMAGE_MAX_FILE_SIZE,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects SVG files and files larger than 10MB', async () => {
    const dto = plainToInstance(CreateReceiptImageUploadDto, {
      groupId: 1,
      contentType: 'image/svg+xml',
      fileSize: RECEIPT_IMAGE_MAX_FILE_SIZE + 1,
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['contentType', 'fileSize']),
    );
  });

  it.each([0, -1, 1.5])('rejects a non-positive-integer groupId (%s)', async (groupId) => {
    const dto = plainToInstance(CreateReceiptImageUploadDto, {
      groupId,
      contentType: 'image/jpeg',
      fileSize: 1024,
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['groupId']));
  });
});
