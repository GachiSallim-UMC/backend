import { PATH_METADATA } from '@nestjs/common/constants';

import { AuthPasswordController } from './auth-password.controller';

describe('AuthPasswordController', () => {
  it('exposes the password change route below the global API prefix', () => {
    const changePassword = Object.getOwnPropertyDescriptor(
      AuthPasswordController.prototype,
      'changePassword',
    )?.value as (...args: unknown[]) => unknown;

    expect(Reflect.getMetadata(PATH_METADATA, AuthPasswordController)).toBe('auth/password');
    expect(Reflect.getMetadata(PATH_METADATA, changePassword)).toBe('change');
  });
});
