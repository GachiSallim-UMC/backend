import { validate } from 'class-validator';

import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it('accepts non-empty string passwords', async () => {
    const dto = Object.assign(new ChangePasswordDto(), {
      previousPassword: 'CurrentPass1',
      newPassword: 'Abcdefghijklmno1',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('requires both password fields', async () => {
    const errors = await validate(new ChangePasswordDto());

    expect(errors.map((error) => error.property).sort()).toEqual([
      'newPassword',
      'previousPassword',
    ]);
  });

  it('rejects non-string password fields', async () => {
    const dto = Object.assign(new ChangePasswordDto(), {
      previousPassword: 1234,
      newPassword: 5678,
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error.constraints?.isString !== undefined)).toBe(true);
  });

  it.each([
    ['previousPassword', 'a'.repeat(257)],
    ['previousPassword', 'Current Pass1'],
    ['newPassword', 'A1'.concat('a'.repeat(15))],
    ['newPassword', 'New Pass1'],
  ])('rejects an invalid password %s boundary', async (property, value) => {
    const dto = Object.assign(new ChangePasswordDto(), {
      previousPassword: 'CurrentPass1',
      newPassword: 'NewPassword1',
      [property]: value,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === property)).toBe(true);
  });
});
