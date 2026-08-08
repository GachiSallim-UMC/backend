import { ResendSignupEmailDto } from './dto/resend-signup-email.dto';
import { AuthRegistrationController } from './registration.controller';
import { AuthRegistrationService } from './registration.service';

describe('AuthRegistrationController', () => {
  it('resends a signup confirmation email without authentication', async () => {
    const resendSignupEmail = jest.fn().mockResolvedValue({
      email: 'member@example.com',
      resent: true,
    });
    const service = { resendSignupEmail } as unknown as AuthRegistrationService;
    const controller = new AuthRegistrationController(service);
    const dto: ResendSignupEmailDto = { email: 'member@example.com' };

    await expect(controller.resendSignupEmail(dto)).resolves.toEqual({
      email: 'member@example.com',
      resent: true,
    });
    expect(resendSignupEmail).toHaveBeenCalledWith(dto);
  });
});
