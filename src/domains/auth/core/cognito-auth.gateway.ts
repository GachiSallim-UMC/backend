import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  DeleteUserCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { COGNITO_ADMIN_SCOPE } from './auth-validation.constant';

@Injectable()
export class CognitoAuthGateway {
  private readonly client: CognitoIdentityProviderClient;
  private readonly userPoolId: string;
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(configService: ConfigService) {
    const region = configService.getOrThrow<string>('AWS_REGION');
    this.userPoolId = configService.getOrThrow<string>('COGNITO_USER_POOL_ID');
    const clientId = configService.getOrThrow<string>('COGNITO_USER_POOL_CLIENT_ID');

    this.client = new CognitoIdentityProviderClient({ region });
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: this.userPoolId,
      tokenUse: 'access',
      clientId,
    });
  }

  async verifyAccessToken(accessToken: string): Promise<string> {
    try {
      const payload = await this.verifier.verify(accessToken);
      const scope = payload.scope;

      if (typeof scope !== 'string' || !scope.split(' ').includes(COGNITO_ADMIN_SCOPE)) {
        throw new Error('Required Cognito scope is missing.');
      }

      return payload.sub;
    } catch {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }
  }

  async createConfirmedUser(email: string, password: string): Promise<string> {
    let created = false;

    try {
      const result = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          TemporaryPassword: password,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
      created = true;

      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );

      const cognitoSub = result.User?.Attributes?.find(
        (attribute) => attribute.Name === 'sub',
      )?.Value;

      if (!cognitoSub) {
        throw new Error('Cognito did not return the user sub.');
      }

      return cognitoSub;
    } catch (error) {
      if (created) {
        await this.deleteAdminUserSilently(email);
      }

      this.throwMappedError(error);
    }
  }

  async deleteAdminUser(email: string): Promise<void> {
    try {
      await this.client.send(
        new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: email }),
      );
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async globalSignOut(accessToken: string): Promise<void> {
    try {
      await this.client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch (error) {
      if (this.getErrorName(error) === 'NotAuthorizedException') {
        return;
      }

      this.throwMappedError(error);
    }
  }

  async changePassword(
    accessToken: string,
    previousPassword: string,
    newPassword: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new ChangePasswordCommand({
          AccessToken: accessToken,
          PreviousPassword: previousPassword,
          ProposedPassword: newPassword,
        }),
      );
    } catch (error) {
      if (this.getErrorName(error) === 'NotAuthorizedException') {
        throw new BusinessException(ErrorCode.AUTH_INVALID_PASSWORD);
      }

      this.throwMappedError(error);
    }
  }

  async deleteUser(accessToken: string): Promise<void> {
    try {
      await this.client.send(new DeleteUserCommand({ AccessToken: accessToken }));
    } catch (error) {
      this.throwMappedError(error, true);
    }
  }

  private async deleteAdminUserSilently(email: string): Promise<void> {
    try {
      await this.client.send(
        new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: email }),
      );
    } catch {
      // Preserve the original Cognito failure.
    }
  }

  private throwMappedError(error: unknown, unauthorized = false): never {
    const errorName = this.getErrorName(error);

    if (errorName === 'UsernameExistsException') {
      throw new BusinessException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
    }

    if (
      errorName === 'InvalidPasswordException' ||
      errorName === 'PasswordHistoryPolicyViolationException'
    ) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_PASSWORD);
    }

    if (unauthorized && errorName === 'NotAuthorizedException') {
      throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
  }

  private getErrorName(error: unknown): string | undefined {
    return error instanceof Error ? error.name : undefined;
  }
}
