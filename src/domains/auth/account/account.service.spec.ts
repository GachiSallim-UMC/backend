/// <reference types="jest" />
import { DeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { jest } from '@jest/globals';

import { PrismaService } from '../../../prisma/prisma.service';
import { AuthAccountService } from './account.service';

type MockedPrisma = {
  userAuthIdentity: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  user: {
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    updateMany: jest.MockedFunction<(args: unknown) => Promise<{ count: number }>>;
  };
};

type MockedCognitoClient = {
  send: jest.MockedFunction<(command: DeleteUserCommand) => Promise<unknown>>;
};

const ACTIVE_ACCOUNT = {
  user: {
    id: 7n,
    name: '홍길동',
    nickname: '길동',
    email: 'user@example.com',
    profileImage: 'https://example.com/profile.png',
    isActive: true,
  },
};

describe('AuthAccountService', () => {
  let service: AuthAccountService;
  let prisma: MockedPrisma;
  let cognitoClient: MockedCognitoClient;

  beforeEach(() => {
    prisma = {
      userAuthIdentity: {
        findUnique: jest.fn<() => Promise<unknown>>(),
      },
      user: {
        update: jest.fn<() => Promise<unknown>>(),
        updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      },
    };
    cognitoClient = {
      send: jest.fn<() => Promise<unknown>>(),
    };
    service = new AuthAccountService(prisma as unknown as PrismaService, cognitoClient as never);
  });

  it('returns the active account for the Cognito subject', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);

    await expect(service.getAccount('cognito-sub')).resolves.toEqual({
      userId: 7,
      name: '홍길동',
      nickname: '길동',
      email: 'user@example.com',
      profileImage: 'https://example.com/profile.png',
    });
    expect(prisma.userAuthIdentity.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: 'cognito-sub' },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true,
            profileImage: true,
            isActive: true,
          },
        },
      },
    });
  });

  it('rejects a subject without a local auth identity', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(null);

    await expect(service.getAccount('missing-sub')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
  });

  it('rejects an inactive local account', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue({
      user: { ...ACTIVE_ACCOUNT.user, isActive: false },
    });

    await expect(service.getAccount('cognito-sub')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_INACTIVE',
    });
  });

  it('updates only the supplied profile fields', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    prisma.user.update.mockResolvedValue({
      ...ACTIVE_ACCOUNT.user,
      nickname: '새닉네임',
    });

    await expect(
      service.updateProfile('cognito-sub', { nickname: '새닉네임' }),
    ).resolves.toMatchObject({
      userId: 7,
      nickname: '새닉네임',
      profileImage: 'https://example.com/profile.png',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { nickname: '새닉네임' },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        profileImage: true,
        isActive: true,
      },
    });
  });

  it('removes the profile image when profileImage is null', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    prisma.user.update.mockResolvedValue({
      ...ACTIVE_ACCOUNT.user,
      profileImage: null,
    });

    await expect(
      service.updateProfile('cognito-sub', { profileImage: null }),
    ).resolves.toMatchObject({
      userId: 7,
      profileImage: null,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { profileImage: null },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        profileImage: true,
        isActive: true,
      },
    });
  });

  it('rejects an empty profile update', async () => {
    await expect(service.updateProfile('cognito-sub', {})).rejects.toMatchObject({
      code: 'COMMON_INVALID_PARAMETER',
    });
    expect(prisma.userAuthIdentity.findUnique).not.toHaveBeenCalled();
  });

  it('deactivates the account and deletes the Cognito user', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    cognitoClient.send.mockResolvedValue({});

    await expect(service.deleteAccount('cognito-sub', 'access-token')).resolves.toEqual({
      userId: 7,
      deleted: true,
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7n, isActive: true },
      data: { isActive: false },
    });
    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    const command = cognitoClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteUserCommand);
    expect(command.input).toEqual({ AccessToken: 'access-token' });
  });

  it('reactivates the account when Cognito deletion fails', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    cognitoClient.send.mockRejectedValue(new Error('Cognito unavailable'));

    await expect(service.deleteAccount('cognito-sub', 'access-token')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_ERROR',
    });
    expect(prisma.user.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 7n, isActive: true },
      data: { isActive: false },
    });
    expect(prisma.user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 7n, isActive: false },
      data: { isActive: true },
    });
  });

  it('reports compensation failure when reactivation fails', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    prisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('Database unavailable'));
    cognitoClient.send.mockRejectedValue(new Error('Cognito unavailable'));

    await expect(service.deleteAccount('cognito-sub', 'access-token')).rejects.toMatchObject({
      code: 'AUTH_COMPENSATION_FAILED',
    });
  });

  it('lets only one concurrent deletion own the Cognito call and compensation', async () => {
    prisma.userAuthIdentity.findUnique.mockResolvedValue(ACTIVE_ACCOUNT);
    prisma.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    cognitoClient.send.mockResolvedValue({});

    const results = await Promise.allSettled([
      service.deleteAccount('cognito-sub', 'access-token'),
      service.deleteAccount('cognito-sub', 'access-token'),
    ]);

    expect(results[0]).toEqual({ status: 'fulfilled', value: { userId: 7, deleted: true } });
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'AUTH_ACCOUNT_INACTIVE' },
    });
    expect(cognitoClient.send).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
  });
});
