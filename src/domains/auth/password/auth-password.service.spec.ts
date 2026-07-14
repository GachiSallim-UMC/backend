import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { AuthPasswordService } from './auth-password.service';
import { ChangePasswordDto } from './dto/change-password.dto';

describe('AuthPasswordService', () => {
  const accessToken = 'access-token';
  const changePasswordDto: ChangePasswordDto = {
    previousPassword: 'OldPassword1',
    newPassword: 'NewPassword2',
  };

  const createService = (changePassword = jest.fn().mockResolvedValue(undefined)) => {
    const gateway = { changePassword } as unknown as CognitoAuthGateway;
    return { service: new AuthPasswordService(gateway), changePassword };
  };

  it('changes the password with the ALB access token', async () => {
    const { service, changePassword } = createService();

    await expect(service.changePassword(accessToken, changePasswordDto)).resolves.toEqual({
      changed: true,
    });
    expect(changePassword).toHaveBeenCalledWith(
      accessToken,
      changePasswordDto.previousPassword,
      changePasswordDto.newPassword,
    );
  });

  it('propagates an invalid previous password error', async () => {
    const providerError = new BusinessException(ErrorCode.AUTH_INVALID_PASSWORD);
    const { service } = createService(jest.fn().mockRejectedValue(providerError));

    await expect(service.changePassword(accessToken, changePasswordDto)).rejects.toBe(
      providerError,
    );
  });

  it('rejects a new password that does not satisfy the Cognito policy', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      previousPassword: 'OldPassword1',
      newPassword: 'lowercase-only',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});
