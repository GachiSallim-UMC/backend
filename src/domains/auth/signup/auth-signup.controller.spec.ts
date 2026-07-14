/// <reference types="jest" />
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { AuthSignupController } from './auth-signup.controller';

describe('AuthSignupController route', () => {
  it('registers POST /auth/signup controller metadata', () => {
    const signupHandler = Object.getOwnPropertyDescriptor(AuthSignupController.prototype, 'signup')
      ?.value as AuthSignupController['signup'];

    expect(Reflect.getMetadata(PATH_METADATA, AuthSignupController)).toBe('auth');
    expect(Reflect.getMetadata(PATH_METADATA, signupHandler)).toBe('signup');
    expect(Reflect.getMetadata(METHOD_METADATA, signupHandler)).toBe(RequestMethod.POST);
  });
});
