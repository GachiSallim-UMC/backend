import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ConfirmSignupDto } from './confirm-signup.dto';
import { SignupDto } from './signup.dto';
import { SocialSignupDto } from './social-signup.dto';

describe('registration DTOs', () => {
  it('accepts a valid signup request and normalizes its email', async () => {
    const dto = plainToInstance(SignupDto, {
      email: ' User@Example.com ',
      password: 'Abcdefghijklmno1',
      name: '홍길동',
      nickname: '길동',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });

  it.each([
    ['password', 'password'],
    ['password', `A1${'a'.repeat(15)}`],
    ['nickname', '길동!'],
    ['email', 'not-an-email'],
  ])('rejects an invalid %s', async (field, value) => {
    const input = {
      email: 'user@example.com',
      password: 'Password123',
      name: '홍길동',
      nickname: '길동',
      [field]: value,
    };

    const errors = await validate(plainToInstance(SignupDto, input));

    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('requires a six digit confirmation code', async () => {
    const dto = plainToInstance(ConfirmSignupDto, {
      email: 'user@example.com',
      confirmationCode: 'abc',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'confirmationCode')).toBe(true);
  });

  it('accepts and trims a valid social signup profile', async () => {
    const dto = plainToInstance(SocialSignupDto, {
      name: ' 홍길동 ',
      nickname: ' 길동 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ name: '홍길동', nickname: '길동' });
  });

  it('applies the existing profile validation rules to social signup', async () => {
    const dto = plainToInstance(SocialSignupDto, {
      name: '',
      nickname: '길동!',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'nickname']),
    );
  });
});
