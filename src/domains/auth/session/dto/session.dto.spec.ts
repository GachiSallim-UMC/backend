import { validate } from 'class-validator';

import { LoginDto } from './login.dto';
import { RefreshTokenDto } from './refresh-token.dto';

describe('AUTH session DTO validation', () => {
  it('accepts a valid login request', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'user@example.com',
      password: 'Password123',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { email: 'not-an-email', password: 'Password123' },
    { email: 'user@example.com', password: '' },
  ])('rejects an invalid login request: %o', async (input) => {
    const dto = Object.assign(new LoginDto(), input);

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a non-empty refresh token', async () => {
    const dto = Object.assign(new RefreshTokenDto(), { refreshToken: '' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
