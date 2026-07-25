import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RequestPasswordResetDto } from './request-password-reset.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('password reset DTOs', () => {
  it('normalizes a password reset request email', async () => {
    const dto = plainToInstance(RequestPasswordResetDto, {
      email: ' Member@Example.com ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('member@example.com');
  });

  it('accepts a valid password reset confirmation', async () => {
    const dto = plainToInstance(ResetPasswordDto, {
      email: ' Member@Example.com ',
      confirmationCode: '123456',
      newPassword: 'NewPassword1',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('member@example.com');
  });

  it.each([
    ['email', 'not-an-email'],
    ['confirmationCode', '12345'],
    ['confirmationCode', 'abcdef'],
    ['newPassword', 'password'],
  ])('rejects an invalid %s', async (field, value) => {
    const dto = plainToInstance(ResetPasswordDto, {
      email: 'member@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPassword1',
      [field]: value,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
