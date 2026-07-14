/// <reference types="jest" />
import { jest } from '@jest/globals';

import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedUser } from '../core/auth-context.interface';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { AuthAccountService } from './auth-account.service';

type MockedPrisma = {
  user: {
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
};

describe('AuthAccountService', () => {
  const user: AuthenticatedUser = {
    id: 1n,
    cognitoSub: 'cognito-sub',
    email: 'user@example.com',
    nickname: '길동',
    profileImage: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
  };

  let service: AuthAccountService;
  let prisma: MockedPrisma;
  let cognitoAuthGateway: {
    deleteUser: jest.MockedFunction<(accessToken: string) => Promise<void>>;
  };

  beforeEach(() => {
    prisma = {
      user: { update: jest.fn<() => Promise<unknown>>() },
    };
    cognitoAuthGateway = {
      deleteUser: jest.fn<(accessToken: string) => Promise<void>>(),
    };
    service = new AuthAccountService(
      prisma as unknown as PrismaService,
      cognitoAuthGateway as unknown as CognitoAuthGateway,
    );
  });

  it('returns the authenticated user information', () => {
    expect(service.getMe(user)).toEqual({
      id: '1',
      email: 'user@example.com',
      nickname: '길동',
      profileImage: null,
      createdAt: '2026-07-14T00:00:00.000Z',
    });
  });

  it('rejects an empty profile update', async () => {
    await expect(service.updateProfile(user, {})).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates both nickname and name', async () => {
    prisma.user.update.mockResolvedValue({ ...user, name: '새닉네임', nickname: '새닉네임' });

    const result = await service.updateProfile(user, { nickname: '새닉네임' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { nickname: '새닉네임', name: '새닉네임' },
    });
    expect(result.nickname).toBe('새닉네임');
  });

  it.each([
    ['updates', 'https://example.com/profile.png'],
    ['clears', null],
  ])('%s the profile image', async (_operation, profileImage) => {
    prisma.user.update.mockResolvedValue({ ...user, profileImage });

    const result = await service.updateProfile(user, { profileImage });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { profileImage },
    });
    expect(result.profileImage).toBe(profileImage);
  });

  it('deactivates the user before deleting the Cognito account', async () => {
    prisma.user.update.mockResolvedValue(user);
    cognitoAuthGateway.deleteUser.mockResolvedValue();

    await expect(service.withdraw(user, 'access-token')).resolves.toEqual({ withdrawn: true });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { isActive: false },
    });
    expect(cognitoAuthGateway.deleteUser).toHaveBeenCalledWith('access-token');
    expect(prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(
      cognitoAuthGateway.deleteUser.mock.invocationCallOrder[0],
    );
  });

  it('reactivates the user and preserves the Cognito error when deletion fails', async () => {
    const providerError = new Error('provider error');
    prisma.user.update.mockResolvedValue(user);
    cognitoAuthGateway.deleteUser.mockRejectedValue(providerError);

    await expect(service.withdraw(user, 'access-token')).rejects.toBe(providerError);

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1n },
      data: { isActive: false },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1n },
      data: { isActive: true },
    });
  });
});
