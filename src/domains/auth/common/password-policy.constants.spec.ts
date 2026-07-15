import { AUTH_PASSWORD_PATTERN } from './password-policy.constants';

describe('AUTH_PASSWORD_PATTERN', () => {
  it.each(['Abcdefg1', 'Abcdefghijklmno1'])('accepts %s', (password) => {
    expect(AUTH_PASSWORD_PATTERN.test(password)).toBe(true);
  });

  it.each(['Abcdef1', 'Abcdefghijklmno12', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', 'Abc defg1'])(
    'rejects %s',
    (password) => {
      expect(AUTH_PASSWORD_PATTERN.test(password)).toBe(false);
    },
  );
});
