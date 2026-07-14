import { Injectable } from '@nestjs/common';

import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordResponseDto } from './dto/change-password-response.dto';

@Injectable()
export class AuthPasswordService {
  constructor(private readonly cognitoAuthGateway: CognitoAuthGateway) {}

  async changePassword(
    accessToken: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    await this.cognitoAuthGateway.changePassword(
      accessToken,
      changePasswordDto.previousPassword,
      changePasswordDto.newPassword,
    );

    return { changed: true };
  }
}
