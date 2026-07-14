/// <reference types="jest" />
import { validate } from 'class-validator';

import { UpdateAuthProfileDto } from './update-auth-profile.dto';

describe('UpdateAuthProfileDto', () => {
  it('rejects a null nickname', async () => {
    const dto = new UpdateAuthProfileDto();
    dto.nickname = null as unknown as string;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nickname' })]),
    );
  });

  it('allows a null profile image', async () => {
    const dto = new UpdateAuthProfileDto();
    dto.profileImage = null;

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
