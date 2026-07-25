import { createPasswordResetMessageHandler } from './password-reset-message';

describe('password reset custom message', () => {
  it('adds a fragment-based reset link to forgot-password emails', () => {
    const handler = createPasswordResetMessageHandler('https://gachisallim.com/reset-password');
    const event = createEvent('CustomMessage_ForgotPassword');

    expect(handler(event)).toBe(event);
    expect(event.response.emailSubject).toBe('[같이살림] 비밀번호 재설정');
    expect(event.response.emailMessage).toContain(
      'https://gachisallim.com/reset-password#email=member%2Btest%40example.com&amp;code={####}',
    );
    expect(event.response.emailMessage).toContain('비밀번호 재설정');
  });

  it('leaves unrelated Cognito messages unchanged', () => {
    const handler = createPasswordResetMessageHandler('https://gachisallim.com/reset-password');
    const event = createEvent('CustomMessage_SignUp');

    expect(handler(event)).toBe(event);
    expect(event.response).toEqual({});
  });

  it('fails when Cognito omits the verified email', () => {
    const handler = createPasswordResetMessageHandler('https://gachisallim.com/reset-password');
    const event = createEvent('CustomMessage_ForgotPassword');
    event.request.userAttributes.email = undefined;

    expect(() => handler(event)).toThrow('A verified email is required for password reset');
  });

  function createEvent(triggerSource: string) {
    return {
      triggerSource,
      request: {
        codeParameter: '{####}',
        userAttributes: {
          email: 'member+test@example.com' as string | undefined,
          email_verified: 'true' as string | undefined,
        },
      },
      response: {} as {
        emailMessage?: string;
        emailSubject?: string;
      },
    };
  }
});
