import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPreferencesResponseDto } from './dto/notification-preferences-response.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationUsersService } from './notification-users.service';

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesResponseDto = {
  choreDue: true,
  supplyStatusChanged: true,
  newMessage: true,
  expenseRequest: true,
  ruleAgreementRequest: true,
  groupActivity: true,
};

const NOTIFICATION_PREFERENCE_SELECT = {
  choreDueEnabled: true,
  supplyStatusChangedEnabled: true,
  newMessageEnabled: true,
  expenseRequestEnabled: true,
  ruleAgreementRequestEnabled: true,
  groupActivityEnabled: true,
} satisfies Prisma.UserNotificationPreferenceSelect;

type NotificationPreferenceRecord = Prisma.UserNotificationPreferenceGetPayload<{
  select: typeof NOTIFICATION_PREFERENCE_SELECT;
}>;

@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationUsers: NotificationUsersService,
  ) {}

  async getPreferences(cognitoSub: string): Promise<NotificationPreferencesResponseDto> {
    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const preference = await this.prisma.userNotificationPreference.findUnique({
      where: { userId },
      select: NOTIFICATION_PREFERENCE_SELECT,
    });

    return preference ? this.toResponse(preference) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  async updatePreferences(
    cognitoSub: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const data = {
      ...(dto.choreDue !== undefined ? { choreDueEnabled: dto.choreDue } : {}),
      ...(dto.supplyStatusChanged !== undefined
        ? { supplyStatusChangedEnabled: dto.supplyStatusChanged }
        : {}),
      ...(dto.newMessage !== undefined ? { newMessageEnabled: dto.newMessage } : {}),
      ...(dto.expenseRequest !== undefined ? { expenseRequestEnabled: dto.expenseRequest } : {}),
      ...(dto.ruleAgreementRequest !== undefined
        ? { ruleAgreementRequestEnabled: dto.ruleAgreementRequest }
        : {}),
      ...(dto.groupActivity !== undefined ? { groupActivityEnabled: dto.groupActivity } : {}),
    };
    if (Object.keys(data).length === 0) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER);
    }

    const userId = await this.notificationUsers.resolveActiveUserId(cognitoSub);
    const preference = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: NOTIFICATION_PREFERENCE_SELECT,
    });

    return this.toResponse(preference);
  }

  private toResponse(preference: NotificationPreferenceRecord): NotificationPreferencesResponseDto {
    return {
      choreDue: preference.choreDueEnabled,
      supplyStatusChanged: preference.supplyStatusChangedEnabled,
      newMessage: preference.newMessageEnabled,
      expenseRequest: preference.expenseRequestEnabled,
      ruleAgreementRequest: preference.ruleAgreementRequestEnabled,
      groupActivity: preference.groupActivityEnabled,
    };
  }
}
