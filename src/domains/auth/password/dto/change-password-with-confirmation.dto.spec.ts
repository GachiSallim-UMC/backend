import { validate } from 'class-validator';

import { ChangePasswordWithConfirmationDto } from './change-password-with-confirmation.dto';

describe('ChangePasswordWithConfirmationDto', () => {
  it('accepts all three password fields', async () => {
    const dto = Object.assign(new ChangePasswordWithConfirmationDto(), {
      currentPassword: 'CurrentPass1',
      newPassword: 'NewPassword1',
      newPasswordConfirmation: 'NewPassword1',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('requires all three password fields', async () => {
    const errors = await validate(new ChangePasswordWithConfirmationDto());

    expect(errors.map((error) => error.property).sort()).toEqual([
      'currentPassword',
      'newPassword',
      'newPasswordConfirmation',
    ]);
  });

  it.each([
    ['currentPassword', 'Current Pass1'],
    ['currentPassword', 'a'.repeat(257)],
    ['newPassword', 'New Pass1'],
    ['newPassword', 'A1'.concat('a'.repeat(15))],
    ['newPasswordConfirmation', 'a'.repeat(17)],
  ])('rejects an invalid %s', async (property, value) => {
    const dto = Object.assign(new ChangePasswordWithConfirmationDto(), {
      currentPassword: 'CurrentPass1',
      newPassword: 'NewPassword1',
      newPasswordConfirmation: 'NewPassword1',
      [property]: value,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === property)).toBe(true);
  });
});
