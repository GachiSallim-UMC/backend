import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('trims and accepts a valid name', async () => {
    const dto = plainToInstance(UpdateProfileDto, { name: '  홍길동  ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('홍길동');
  });

  it.each(['', 'a'.repeat(31)])('rejects an invalid name length', async (name) => {
    const dto = plainToInstance(UpdateProfileDto, { name });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('name');
  });
});
