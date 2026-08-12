import { AuthContext } from '../common/auth-context.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordWithConfirmationDto } from './dto/change-password-with-confirmation.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';

describe('PasswordController', () => {
  it('requests a password reset without authentication', async () => {
    const requestPasswordReset = jest.fn().mockResolvedValue({ accepted: true });
    const service = { requestPasswordReset } as unknown as PasswordService;
    const controller = new PasswordController(service);
    const dto: RequestPasswordResetDto = { email: 'member@example.com' };

    await expect(controller.requestPasswordReset(dto)).resolves.toEqual({ accepted: true });
    expect(requestPasswordReset).toHaveBeenCalledWith(dto);
  });

  it('confirms a password reset without authentication', async () => {
    const resetPassword = jest.fn().mockResolvedValue({ reset: true });
    const service = { resetPassword } as unknown as PasswordService;
    const controller = new PasswordController(service);
    const dto: ResetPasswordDto = {
      email: 'member@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPassword1',
    };

    await expect(controller.resetPassword(dto)).resolves.toEqual({ reset: true });
    expect(resetPassword).toHaveBeenCalledWith(dto);
  });

  it('uses the access token from the authenticated request', async () => {
    const changePassword = jest.fn().mockResolvedValue({ changed: true });
    const service = { changePassword } as unknown as PasswordService;
    const controller = new PasswordController(service);
    const auth: AuthContext = { cognitoSub: 'cognito-sub', accessToken: 'access-token' };
    const dto: ChangePasswordDto = {
      previousPassword: 'CurrentPass1',
      newPassword: 'NewPassword1',
    };

    await expect(controller.changePassword(auth, dto)).resolves.toEqual({ changed: true });
    expect(changePassword).toHaveBeenCalledWith('access-token', dto);
  });

  it('uses the access token for a password change with confirmation', async () => {
    const changePasswordWithConfirmation = jest.fn().mockResolvedValue({ changed: true });
    const service = { changePasswordWithConfirmation } as unknown as PasswordService;
    const controller = new PasswordController(service);
    const auth: AuthContext = { cognitoSub: 'cognito-sub', accessToken: 'access-token' };
    const dto: ChangePasswordWithConfirmationDto = {
      currentPassword: 'CurrentPass1',
      newPassword: 'NewPassword1',
      newPasswordConfirmation: 'NewPassword1',
    };

    await expect(controller.changePasswordWithConfirmation(auth, dto)).resolves.toEqual({
      changed: true,
    });
    expect(changePasswordWithConfirmation).toHaveBeenCalledWith('access-token', dto);
  });
});
