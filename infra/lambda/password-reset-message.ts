interface PasswordResetMessageEvent {
  triggerSource: string;
  request: {
    codeParameter: string;
    userAttributes: Record<string, string | undefined>;
  };
  response: {
    emailMessage?: string;
    emailSubject?: string;
  };
}

export function createPasswordResetMessageHandler(passwordResetUrl: string) {
  return (event: PasswordResetMessageEvent): PasswordResetMessageEvent => {
    if (event.triggerSource !== 'CustomMessage_ForgotPassword') {
      return event;
    }

    const email = event.request.userAttributes.email;
    if (!email || event.request.userAttributes.email_verified !== 'true') {
      throw new Error('A verified email is required for password reset');
    }

    const resetLink = `${passwordResetUrl}#email=${encodeURIComponent(email)}&amp;code=${event.request.codeParameter}`;
    event.response.emailSubject = '[같이살림] 비밀번호 재설정';
    event.response.emailMessage = [
      '<p>같이살림 비밀번호 재설정 요청을 받았습니다.</p>',
      `<p><a href="${resetLink}">비밀번호 재설정</a></p>`,
      '<p>본인이 요청하지 않았다면 이 이메일을 무시해 주세요.</p>',
    ].join('');

    return event;
  };
}

export function handler(event: PasswordResetMessageEvent): PasswordResetMessageEvent {
  const passwordResetUrl = process.env.PASSWORD_RESET_URL;
  if (!passwordResetUrl) {
    throw new Error('PASSWORD_RESET_URL is required');
  }

  return createPasswordResetMessageHandler(passwordResetUrl)(event);
}
