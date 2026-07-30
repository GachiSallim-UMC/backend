import {
  CognitoIdentityProviderClient,
  DeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Inject, Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { COGNITO_IDP_CLIENT } from '../common/cognito.constants';
import { AuthAccountResponseDto } from './dto/auth-account-response.dto';
import { DeleteAuthAccountResponseDto } from './dto/delete-auth-account-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COGNITO_IDP_CLIENT) private readonly cognitoClient: CognitoIdentityProviderClient,
  ) {}

  async getAccount(cognitoSub: string): Promise<AuthAccountResponseDto> {
    const account = await this.findActiveAccount(cognitoSub);

    return this.toResponse(account.user);
  }

  async updateProfile(cognitoSub: string, dto: UpdateProfileDto): Promise<AuthAccountResponseDto> {
    if (dto.name === undefined && dto.nickname === undefined && dto.profileImage === undefined) {
      throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER);
    }

    const account = await this.findActiveAccount(cognitoSub);
    const user = await this.prisma.user.update({
      where: { id: account.user.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.profileImage !== undefined ? { profileImage: dto.profileImage } : {}),
      },
      select: ACCOUNT_USER_SELECT,
    });

    return this.toResponse(user);
  }

  async exportMyData(cognitoSub: string): Promise<MyDataExportFile> {
    const account = await this.findActiveAccount(cognitoSub);
    const userId = account.user.id;

    const [chores, expenses, activities] = await Promise.all([
      this.prisma.chore.findMany({
        where: {
          OR: [{ assigneeId: userId }, { createdBy: userId }, { completedBy: userId }],
        },
        select: {
          id: true,
          groupId: true,
          group: { select: { name: true } },
          title: true,
          category: true,
          status: true,
          assigneeId: true,
          completedBy: true,
          createdBy: true,
          startDate: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.expense.findMany({
        where: {
          OR: [{ payerId: userId }, { createdBy: userId }, { splits: { some: { userId } } }],
        },
        select: {
          id: true,
          groupId: true,
          group: { select: { name: true } },
          title: true,
          category: true,
          status: true,
          totalAmount: true,
          payerId: true,
          createdBy: true,
          createdAt: true,
          splits: {
            where: { userId },
            select: { amount: true, status: true },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.activityLog.findMany({
        where: { userId },
        select: {
          id: true,
          refId: true,
          groupId: true,
          group: { select: { name: true } },
          type: true,
          description: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const rows: CsvValue[][] = [
      ...chores.map((chore) => [
        'CHORE',
        Number(chore.id),
        null,
        Number(chore.groupId),
        chore.group.name,
        chore.title,
        chore.category,
        chore.status,
        null,
        null,
        null,
        [
          ...(chore.assigneeId === userId ? ['ASSIGNEE'] : []),
          ...(chore.createdBy === userId ? ['CREATOR'] : []),
          ...(chore.completedBy === userId ? ['COMPLETER'] : []),
        ].join('|'),
        toIso(chore.startDate),
        toIso(chore.dueDate),
        toIso(chore.completedAt),
        toIso(chore.createdAt),
        null,
      ]),
      ...expenses.map((expense) => {
        const personalSplit = expense.splits[0];

        return [
          'EXPENSE',
          Number(expense.id),
          null,
          Number(expense.groupId),
          expense.group.name,
          expense.title,
          expense.category,
          expense.status,
          personalSplit?.status ?? null,
          expense.totalAmount,
          personalSplit?.amount ?? null,
          [
            ...(expense.payerId === userId ? ['PAYER'] : []),
            ...(expense.createdBy === userId ? ['CREATOR'] : []),
            ...(personalSplit ? ['PARTICIPANT'] : []),
          ].join('|'),
          null,
          null,
          null,
          toIso(expense.createdAt),
          null,
        ];
      }),
      ...activities.map((activity) => [
        'ACTIVITY',
        Number(activity.id),
        activity.refId === null ? null : Number(activity.refId),
        Number(activity.groupId),
        activity.group.name,
        null,
        activity.type,
        null,
        null,
        null,
        null,
        'ACTOR',
        null,
        null,
        null,
        toIso(activity.createdAt),
        activity.description,
      ]),
    ];

    const csv = [MY_DATA_EXPORT_HEADERS, ...rows]
      .map((row) => row.map(toCsvCell).join(','))
      .join('\r\n');
    const date = new Date().toISOString().slice(0, 10);

    return {
      filename: `gachisallim-my-data-${date}.csv`,
      content: Buffer.from(`\uFEFF${csv}\r\n`, 'utf8'),
    };
  }

  async deleteAccount(
    cognitoSub: string,
    accessToken: string,
  ): Promise<DeleteAuthAccountResponseDto> {
    const account = await this.findActiveAccount(cognitoSub);

    const transition = await this.prisma.user.updateMany({
      where: { id: account.user.id, isActive: true },
      data: { isActive: false },
    });

    if (transition.count !== 1) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    try {
      await this.cognitoClient.send(new DeleteUserCommand({ AccessToken: accessToken }));
    } catch {
      await this.restoreAccount(account.user.id);
      throw new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    }

    return { userId: Number(account.user.id), deleted: true };
  }

  private async findActiveAccount(cognitoSub: string): Promise<AuthAccountRecord> {
    const account = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: { user: { select: ACCOUNT_USER_SELECT } },
    });

    if (!account) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND);
    }

    if (!account.user.isActive) {
      throw new BusinessException(ErrorCode.AUTH_ACCOUNT_INACTIVE);
    }

    return account;
  }

  private async restoreAccount(userId: bigint): Promise<void> {
    try {
      const transition = await this.prisma.user.updateMany({
        where: { id: userId, isActive: false },
        data: { isActive: true },
      });

      if (transition.count !== 1) {
        throw new Error('Account state changed before compensation');
      }
    } catch {
      throw new BusinessException(ErrorCode.AUTH_COMPENSATION_FAILED);
    }
  }

  private toResponse(user: AccountUser): AuthAccountResponseDto {
    return {
      userId: Number(user.id),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      profileImage: user.profileImage,
    };
  }
}

const ACCOUNT_USER_SELECT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  profileImage: true,
  isActive: true,
} as const;

interface AccountUser {
  id: bigint;
  name: string;
  nickname: string;
  email: string;
  profileImage: string | null;
  isActive: boolean;
}

interface AuthAccountRecord {
  user: AccountUser;
}

interface MyDataExportFile {
  filename: string;
  content: Buffer;
}

type CsvValue = string | number | null;

const MY_DATA_EXPORT_HEADERS = [
  'recordType',
  'recordId',
  'relatedRecordId',
  'groupId',
  'groupName',
  'title',
  'category',
  'status',
  'personalStatus',
  'totalAmount',
  'personalAmount',
  'roles',
  'startAt',
  'dueAt',
  'completedAt',
  'createdAt',
  'description',
] as const;

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toCsvCell(value: CsvValue): string {
  if (value === null) {
    return '';
  }

  let text = String(value);
  if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
