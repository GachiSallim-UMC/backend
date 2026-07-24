import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';

// --- 동적 모델 접근을 위한 명확한 타입 인터페이스 정의 ---
interface BaseEntity {
  id: bigint;
  groupId: bigint;
  createdAt: Date;
  updatedAt?: Date;
  createdBy: bigint;
  updatedBy?: bigint;
}

interface ExpenseEntity extends BaseEntity {
  title: string;
  status?: string;
}

interface ChoreEntity extends BaseEntity {
  title: string;
  assigneeId?: bigint;
  isCompleted?: boolean;
  status?: string;
}

interface RuleEntity extends BaseEntity {
  title: string;
}

interface SupplyEntity extends BaseEntity {
  name?: string;
  title?: string;
}

interface DynamicPrismaDelegate<T> {
  findMany(args: {
    where: { groupId: bigint };
    orderBy: { updatedAt: 'desc' };
    take: number;
  }): Promise<T[]>;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 그룹 멤버십 권한 검증
   */
  async validateGroupMembership(cognitoSub: string, groupId: number) {
    const authIdentity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: { userId: true },
    });

    if (!authIdentity) {
      throw new ForbiddenException('존재하지 않거나 인증되지 않은 사용자입니다.');
    }

    const member = await this.prisma.groupMember.findFirst({
      where: {
        userId: authIdentity.userId,
        groupId: BigInt(groupId),
        leftAt: null,
      },
    });

    if (!member) {
      throw new ForbiddenException('해당 그룹의 활동 내역을 조회할 권한이 없습니다.');
    }
  }

  // 1. 활동 자동/백그라운드 기록 (도메인 서비스 내부 호출용)
  async logActivity(createActivityDto: CreateActivityDto) {
    const { groupId, userId, type, refId, description } = createActivityDto;

    const log = await this.prisma.activityLog.create({
      data: {
        groupId: BigInt(groupId),
        userId: BigInt(userId),
        type,
        refId: refId ? BigInt(refId) : null,
        description,
      },
    });

    return {
      message: '활동 로그가 백그라운드에 자동으로 기록되었습니다.',
      activityId: Number(log.id),
    };
  }

  // 2. 활동 목록 조회 (ACT-LIST-01)
  async getActivities(query: GetActivityQueryDto) {
    const { groupId, type, userId, page = 1 } = query;
    const limit = 10;
    const skip = (page - 1) * limit;

    // 8가지 모든 도메인 이벤트를 ActivityLog로 자동 동기화
    await this.syncDomainDataToActivityLog(groupId);

    const logs = await this.prisma.activityLog.findMany({
      where: {
        groupId: BigInt(groupId),
        ...(type && { type }),
        ...(userId && { userId: BigInt(userId) }),
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    const formattedActivities = logs.map((log) => ({
      id: Number(log.id),
      type: log.type,
      description: log.description,
      createdAt: log.createdAt,
      user: {
        id: Number(log.user.id),
        nickname: log.user.nickname ?? '알 수 없음',
      },
    }));

    return {
      statusCode: 200,
      data: formattedActivities,
      error: null,
    };
  }

  private async syncDomainDataToActivityLog(groupId: number) {
    const groupBigInt = BigInt(groupId);

    // 1️. 지출 (EXPENSE_CREATED, EXPENSE_DONE)
    if ('expense' in this.prisma) {
      const expenseDelegate = (this.prisma as unknown as { expense: DynamicPrismaDelegate<ExpenseEntity> }).expense;
      const expenses = await expenseDelegate.findMany({
        where: { groupId: groupBigInt },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const exp of expenses) {
        // 1-A. 지출 생성 (EXPENSE_CREATED)
        const existsCreated = await this.prisma.activityLog.findFirst({
          where: { groupId: groupBigInt, type: 'EXPENSE_CREATED', refId: exp.id },
        });

        if (!existsCreated) {
          await this.prisma.activityLog.create({
            data: {
              groupId: exp.groupId,
              userId: exp.createdBy,
              type: 'EXPENSE_CREATED',
              refId: exp.id,
              description: `지출 ${exp.title}이(가) 추가되었습니다.`,
              createdAt: exp.createdAt,
            },
          });
        }

        // 1-B. 지출 정산 완료 (EXPENSE_DONE - status가 SETTLED 또는 COMPLETED 인 경우)
        if (exp.status === 'SETTLED' || exp.status === 'COMPLETED') {
          const existsDone = await this.prisma.activityLog.findFirst({
            where: { groupId: groupBigInt, type: 'EXPENSE_DONE', refId: exp.id },
          });

          if (!existsDone) {
            await this.prisma.activityLog.create({
              data: {
                groupId: exp.groupId,
                userId: exp.createdBy,
                type: 'EXPENSE_DONE',
                refId: exp.id,
                description: `지출 ${exp.title} 정산이 완료되었습니다.`,
                createdAt: exp.updatedAt || exp.createdAt,
              },
            });
          }
        }
      }
    }

    // 2️. 집안일 (CHORE_CREATED, CHORE_DONE)
    if ('chore' in this.prisma) {
      const choreDelegate = (this.prisma as unknown as { chore: DynamicPrismaDelegate<ChoreEntity> }).chore;
      const chores = await choreDelegate.findMany({
        where: { groupId: groupBigInt },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const chore of chores) {
        // 2-A. 집안일 생성 (CHORE_CREATED)
        const existsCreated = await this.prisma.activityLog.findFirst({
          where: { groupId: groupBigInt, type: 'CHORE_CREATED', refId: chore.id },
        });

        if (!existsCreated) {
          await this.prisma.activityLog.create({
            data: {
              groupId: chore.groupId,
              userId: chore.assigneeId || chore.createdBy,
              type: 'CHORE_CREATED',
              refId: chore.id,
              description: `집안일 ${chore.title}이(가) 추가되었습니다.`,
              createdAt: chore.createdAt,
            },
          });
        }

        // 2-B. 집안일 완료 (CHORE_DONE - isCompleted가 true이거나 status가 DONE인 경우)
        if (chore.isCompleted || chore.status === 'DONE') {
          const existsDone = await this.prisma.activityLog.findFirst({
            where: { groupId: groupBigInt, type: 'CHORE_DONE', refId: chore.id },
          });

          if (!existsDone) {
            await this.prisma.activityLog.create({
              data: {
                groupId: chore.groupId,
                userId: chore.assigneeId || chore.createdBy,
                type: 'CHORE_DONE',
                refId: chore.id,
                description: `집안일 ${chore.title}을(를) 완료했습니다.`,
                createdAt: chore.updatedAt || chore.createdAt,
              },
            });
          }
        }
      }
    }

    // 3️. 규칙 (RULE_CREATED, RULE_EDITED)
    if ('rule' in this.prisma) {
      const ruleDelegate = (this.prisma as unknown as { rule: DynamicPrismaDelegate<RuleEntity> }).rule;
      const rules = await ruleDelegate.findMany({
        where: { groupId: groupBigInt },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const rule of rules) {
        // 3-A. 규칙 생성 (RULE_CREATED)
        const existsCreated = await this.prisma.activityLog.findFirst({
          where: { groupId: groupBigInt, type: 'RULE_CREATED', refId: rule.id },
        });

        if (!existsCreated) {
          await this.prisma.activityLog.create({
            data: {
              groupId: rule.groupId,
              userId: rule.createdBy,
              type: 'RULE_CREATED',
              refId: rule.id,
              description: `새로운 규칙 ${rule.title}이(가) 등록되었습니다.`,
              createdAt: rule.createdAt,
            },
          });
        }

        // 3-B. 규칙 수정 (RULE_EDITED - 생성일과 수정일이 다른 경우)
        if (rule.updatedAt && new Date(rule.updatedAt).getTime() > new Date(rule.createdAt).getTime()) {
          const existsEdited = await this.prisma.activityLog.findFirst({
            where: { groupId: groupBigInt, type: 'RULE_EDITED', refId: rule.id },
          });

          if (!existsEdited) {
            await this.prisma.activityLog.create({
              data: {
                groupId: rule.groupId,
                userId: rule.updatedBy || rule.createdBy,
                type: 'RULE_EDITED',
                refId: rule.id,
                description: `규칙 ${rule.title}이(가) 수정되었습니다.`,
                createdAt: rule.updatedAt,
              },
            });
          }
        }
      }
    }

    // 4️. 생필품 (SUPPLY_CHANGED)
    if ('supply' in this.prisma) {
      const supplyDelegate = (this.prisma as unknown as { supply: DynamicPrismaDelegate<SupplyEntity> }).supply;
      const supplies = await supplyDelegate.findMany({
        where: { groupId: groupBigInt },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const supply of supplies) {
        const exists = await this.prisma.activityLog.findFirst({
          where: { groupId: groupBigInt, type: 'SUPPLY_CHANGED', refId: supply.id },
        });

        if (!exists) {
          await this.prisma.activityLog.create({
            data: {
              groupId: supply.groupId,
              userId: supply.updatedBy || supply.createdBy,
              type: 'SUPPLY_CHANGED',
              refId: supply.id,
              description: `생필품 ${supply.name || supply.title || ''} 상태가 변경되었습니다.`,
              createdAt: supply.updatedAt || supply.createdAt,
            },
          });
        }
      }
    }

    // 5️. 그룹 멤버 가입 (MEMBER_JOINED)
    if ('groupMember' in this.prisma) {
      const members = await this.prisma.groupMember.findMany({
        where: { groupId: groupBigInt, leftAt: null },
        orderBy: { joinedAt: 'desc' },
        take: 20,
      });

      for (const member of members) {
        const exists = await this.prisma.activityLog.findFirst({
          where: { groupId: groupBigInt, type: 'MEMBER_JOINED', userId: member.userId },
        });

        if (!exists) {
          await this.prisma.activityLog.create({
            data: {
              groupId: member.groupId,
              userId: member.userId,
              type: 'MEMBER_JOINED',
              refId: member.id,
              description: `새로운 멤버가 그룹에 참여했습니다.`,
              createdAt: member.joinedAt || new Date(),
            },
          });
        }
      }
    }
  }
}