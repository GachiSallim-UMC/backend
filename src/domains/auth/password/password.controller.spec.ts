import { AuthContext } from '../common/auth-context.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';

describe('PasswordController', () => {
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
});
