import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationUsersService } from './notification-users.service';

describe('NotificationPreferencesService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const resolveActiveUserId = jest.fn().mockResolvedValue(8n);
  const prisma = {
    userNotificationPreference: { findUnique, upsert },
  } as unknown as PrismaService;
  const notificationUsers = {
    resolveActiveUserId,
  } as unknown as NotificationUsersService;
  const service = new NotificationPreferencesService(prisma, notificationUsers);
  const storedPreference = {
    choreDueEnabled: true,
    supplyStatusChangedEnabled: false,
    newMessageEnabled: true,
    expenseRequestEnabled: true,
    ruleAgreementRequestEnabled: true,
    groupActivityEnabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(8n);
  });

  it('returns all-enabled defaults when the user has no stored preference', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.getPreferences('cognito-sub')).resolves.toEqual({
      choreDue: true,
      supplyStatusChanged: true,
      newMessage: true,
      expenseRequest: true,
      ruleAgreementRequest: true,
      groupActivity: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 8n },
      select: {
        choreDueEnabled: true,
        supplyStatusChangedEnabled: true,
        newMessageEnabled: true,
        expenseRequestEnabled: true,
        ruleAgreementRequestEnabled: true,
        groupActivityEnabled: true,
      },
    });
  });

  it('upserts only the supplied fields and returns the full preference', async () => {
    upsert.mockResolvedValue(storedPreference);

    await expect(
      service.updatePreferences('cognito-sub', { supplyStatusChanged: false }),
    ).resolves.toEqual({
      choreDue: true,
      supplyStatusChanged: false,
      newMessage: true,
      expenseRequest: true,
      ruleAgreementRequest: true,
      groupActivity: true,
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 8n },
      create: { userId: 8n, supplyStatusChangedEnabled: false },
      update: { supplyStatusChangedEnabled: false },
      select: {
        choreDueEnabled: true,
        supplyStatusChangedEnabled: true,
        newMessageEnabled: true,
        expenseRequestEnabled: true,
        ruleAgreementRequestEnabled: true,
        groupActivityEnabled: true,
      },
    });
  });

  it('rejects an empty update before resolving the user', async () => {
    await expect(service.updatePreferences('cognito-sub', {})).rejects.toMatchObject({
      code: 'COMMON_INVALID_PARAMETER',
    });
    expect(resolveActiveUserId).not.toHaveBeenCalled();
  });
});
