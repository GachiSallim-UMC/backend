import { PrismaService } from '../../prisma/prisma.service';
import { NotificationUsersService } from './notification-users.service';

describe('NotificationUsersService', () => {
  const findUnique = jest.fn();
  const prisma = { userAuthIdentity: { findUnique } } as unknown as PrismaService;
  const service = new NotificationUsersService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('resolves the active local user id from a Cognito subject', async () => {
    findUnique.mockResolvedValue({ user: { id: 7n, isActive: true } });

    await expect(service.resolveActiveUserId('cognito-sub')).resolves.toBe(7n);
    expect(findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: 'cognito-sub' },
      select: { user: { select: { id: true, isActive: true } } },
    });
  });

  it('rejects an unknown Cognito identity', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.resolveActiveUserId('missing')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
  });

  it('rejects an inactive local user', async () => {
    findUnique.mockResolvedValue({ user: { id: 7n, isActive: false } });

    await expect(service.resolveActiveUserId('inactive')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_INACTIVE',
    });
  });
});
