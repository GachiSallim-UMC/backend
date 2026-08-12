import { Injectable } from '@nestjs/common';
import { GroupRole, MessageType, RuleAction } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { RuleAgreementResponseDto } from './dto/rule-agreement-response.dto';
import { RuleListResponseDto } from './dto/rule-list-response.dto';
import { RuleDetailResponseDto } from './dto/rule-detail-response.dto';
import { RuleResponseDto } from './dto/rule-response.dto';
import { ShareRuleResponseDto } from './dto/share-rule-response.dto';
import { RuleAgreementStatusValue, UpdateRuleAgreementDto } from './dto/update-rule-agreement.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleStatusService } from './rule-status.service';

@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleStatusService: RuleStatusService,
  ) {}

  async getRules(query: ListRulesQueryDto, currentUserId: bigint): Promise<RuleListResponseDto> {
    const where = {
      groupId: BigInt(query.groupId),
      ...(query.status ? { status: query.status } : {}),
    };

    const rules = await this.prisma.rule.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            nickname: true,
          },
        },
        agreements: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      rules: rules.map((rule) => {
        const agreements = rule.agreements ?? [];
        const agreedCount = agreements.filter((agreement) => agreement.status === 'AGREED').length;
        const disagreedCount = agreements.filter(
          (agreement) => agreement.status === 'DISAGREED',
        ).length;
        const pendingCount = agreements.filter(
          (agreement) => agreement.status === 'PENDING',
        ).length;
        const myAgreement = agreements.find(
          (agreement) => agreement.userId === currentUserId,
        );

        return {
          ruleId: Number(rule.id),
          groupId: Number(rule.groupId),
          categoryId: rule.categoryId ? Number(rule.categoryId) : null,
          title: rule.title,
          description: rule.description,
          status: rule.status,
          createdBy: {
            userId: Number(rule.creator.id),
            nickname: rule.creator.nickname,
          },
          myAgreementStatus: myAgreement?.status ?? null,
          agreementSummary: {
            totalCount: agreements.length,
            agreedCount,
            disagreedCount,
            pendingCount,
          },
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        };
      }),
    };
  }

  async getRule(ruleId: bigint, currentUserId: bigint): Promise<RuleDetailResponseDto> {
    const rule = await this.prisma.rule.findUnique({
      where: { id: ruleId },
      include: {
        category: {
          select: { name: true },
        },
        creator: {
          select: {
            id: true,
            nickname: true,
          },
        },
        agreements: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
          orderBy: {
            id: 'asc',
          },
        },
        logs: {
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
        },
      },
    });

    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    await this.requireActiveGroupMemberOrThrow(rule.groupId, currentUserId);

    const agreements = rule.agreements ?? [];
    const agreedCount = agreements.filter((agreement) => agreement.status === 'AGREED').length;
    const disagreedCount = agreements.filter(
      (agreement) => agreement.status === 'DISAGREED',
    ).length;
    const pendingCount = agreements.filter((agreement) => agreement.status === 'PENDING').length;
    const myAgreement = agreements.find((agreement) => agreement.userId === currentUserId);
    const actionLabel: Record<string, string> = {
      CREATED: '님이 규칙을 등록했습니다.',
      UPDATED: '님이 규칙을 수정했습니다.',
      AGREED: '님이 동의했습니다.',
      DISAGREED: '님이 반대했습니다.',
      PENDING: '님이 동의 상태를 대기로 변경했습니다.',
    };

    return {
      ruleId: Number(rule.id),
      groupId: Number(rule.groupId),
      categoryId: rule.categoryId ? Number(rule.categoryId) : null,
      categoryName: rule.category ? rule.category.name : null,
      title: rule.title,
      description: rule.description,
      status: rule.status,
      createdBy: {
        userId: Number(rule.creator.id),
        nickname: rule.creator.nickname,
      },
      myAgreementStatus: myAgreement?.status ?? null,
      agreementSummary: {
        totalCount: agreements.length,
        agreedCount,
        disagreedCount,
        pendingCount,
      },
      agreements: agreements.map((agreement) => ({
        userId: Number(agreement.user.id),
        nickname: agreement.user.nickname,
        status: agreement.status,
        confirmedAt: agreement.confirmedAt ? agreement.confirmedAt.toISOString() : null,
      })),
      histories: rule.logs.map((log) => ({
        logId: Number(log.id),
        action: log.action,
        message: `${log.user.nickname} ${actionLabel[log.action] || '님이 규칙 상태를 변경했습니다.'}`,
        createdAt: log.createdAt.toISOString(),
      })),
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private async requireActiveGroupMemberOrThrow(groupId: bigint, userId: bigint) {
    const member = await this.prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    if (!member || member.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    return member;
  }

  async createRule(dto: CreateRuleDto, currentUserId: bigint): Promise<RuleResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: BigInt(dto.groupId) } });
    if (!group) {
      throw new BusinessException(ErrorCode.RULE_GROUP_NOT_FOUND);
    }

    const category = await this.prisma.ruleCategory.findUnique({
      where: { id: BigInt(dto.categoryId) },
    });
    if (!category) {
      throw new BusinessException(ErrorCode.RULE_CATEGORY_NOT_FOUND);
    }

    const groupMembers = await this.prisma.groupMember.findMany({
      where: {
        groupId: BigInt(dto.groupId),
        leftAt: null,
      },
      select: { userId: true },
    });

    const rule = await this.prisma.rule.create({
      data: {
        groupId: BigInt(dto.groupId),
        categoryId: BigInt(dto.categoryId),
        userId: currentUserId,
        title: dto.title,
        description: dto.description,
        status: 'INACTIVE',
        agreements: {
          createMany: {
            data: groupMembers.map(({ userId }) => ({
              userId,
              status: 'PENDING',
              confirmedAt: null,
            })),
          },
        },
        logs: {
          create: {
            userId: currentUserId,
            action: RuleAction.CREATED,
            snapshot: JSON.stringify({
              categoryId: dto.categoryId,
              title: dto.title,
              description: dto.description,
              status: 'INACTIVE',
            }),
          },
        },
      },
    });

    return { ruleId: Number(rule.id), title: rule.title };
  }

  async updateRule(
    ruleId: bigint,
    dto: UpdateRuleDto,
    currentUserId: bigint,
  ): Promise<RuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    if (rule.userId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    const category = await this.prisma.ruleCategory.findUnique({
      where: { id: BigInt(dto.categoryId) },
    });
    if (!category) {
      throw new BusinessException(ErrorCode.RULE_CATEGORY_NOT_FOUND);
    }

    const groupMembers = await this.prisma.groupMember.findMany({
      where: {
        groupId: rule.groupId,
        leftAt: null,
      },
      select: { userId: true },
    });

    const updatedRule = await this.prisma.rule.update({
      where: { id: ruleId },
      data: {
        categoryId: BigInt(dto.categoryId),
        title: dto.title,
        description: dto.description,
        status: 'INACTIVE',
        agreements: {
          upsert: groupMembers.map(({ userId }) => ({
            where: {
              ruleId_userId: {
                ruleId,
                userId,
              },
            },
            create: {
              userId,
              status: 'PENDING',
              confirmedAt: null,
            },
            update: {
              status: 'PENDING',
              confirmedAt: null,
            },
          })),
        },
        logs: {
          create: {
            userId: currentUserId,
            action: RuleAction.UPDATED,
            snapshot: JSON.stringify({
              categoryId: dto.categoryId,
              title: dto.title,
              description: dto.description,
              status: 'INACTIVE',
            }),
          },
        },
      },
    });

    return { ruleId: Number(updatedRule.id), title: updatedRule.title };
  }

  async updateRuleAgreement(
    ruleId: bigint,
    dto: UpdateRuleAgreementDto,
    currentUserId: bigint,
  ): Promise<RuleAgreementResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: BigInt(ruleId) } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const groupMember = await this.prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: currentUserId,
          groupId: rule.groupId,
        },
      },
    });
    if (!groupMember || groupMember.leftAt) {
      throw new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND);
    }

    const confirmedAt = dto.status === RuleAgreementStatusValue.PENDING ? null : new Date();
    const actionByStatus = {
      [RuleAgreementStatusValue.AGREED]: RuleAction.AGREED,
      [RuleAgreementStatusValue.DISAGREED]: RuleAction.DISAGREED,
      [RuleAgreementStatusValue.PENDING]: RuleAction.PENDING,
    };
    const agreement = await this.ruleStatusService.runWithRecalculation(ruleId, async (tx) => {
      const existingAgreement = await tx.ruleAgreement.findUnique({
        where: {
          ruleId_userId: {
            ruleId,
            userId: currentUserId,
          },
        },
      });

      if (existingAgreement?.status === dto.status) {
        return existingAgreement;
      }

      const updatedAgreement = await tx.ruleAgreement.upsert({
        where: {
          ruleId_userId: {
            ruleId,
            userId: currentUserId,
          },
        },
        create: {
          ruleId,
          userId: currentUserId,
          status: dto.status,
          confirmedAt,
        },
        update: {
          status: dto.status,
          confirmedAt,
        },
      });
      await tx.ruleLog.create({
        data: {
          ruleId,
          userId: currentUserId,
          action: actionByStatus[dto.status],
          snapshot: JSON.stringify({ status: dto.status }),
        },
      });
      return updatedAgreement;
    });

    return {
      agreementId: Number(agreement.id),
      ruleId: Number(agreement.ruleId),
      userId: Number(agreement.userId),
      status: agreement.status,
      confirmedAt: agreement.confirmedAt?.toISOString() ?? null,
    };
  }

  async deleteRule(ruleId: bigint, currentUserId: bigint): Promise<RuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const membership = await this.requireActiveGroupMemberOrThrow(rule.groupId, currentUserId);

    if (rule.userId !== currentUserId && membership.role !== GroupRole.ADMIN) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    const [, deletedRule] = await this.prisma.$transaction([
      this.prisma.ruleLog.deleteMany({ where: { ruleId } }),
      this.prisma.rule.delete({ where: { id: ruleId } }),
    ]);

    return { ruleId: Number(deletedRule.id), title: deletedRule.title };
  }

  async shareRule(ruleId: bigint, senderId: bigint): Promise<ShareRuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    await this.requireActiveGroupMemberOrThrow(rule.groupId, senderId);

    const chatRoom = await this.prisma.chatRoom.findFirst({
      where: {
        groupId: rule.groupId,
        isDefault: true,
      },
    });
    if (!chatRoom) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const chatRoomMember = await this.prisma.chatRoomMember.findUnique({
      where: {
        chatRoomId_userId: {
          chatRoomId: chatRoom.id,
          userId: senderId,
        },
      },
    });
    if (!chatRoomMember) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: chatRoom.id,
        senderId,
        type: MessageType.CARD_RULE,
        content: rule.title,
        refId: rule.id,
      },
    });

    return {
      ruleId: Number(rule.id),
      messageId: Number(message.id),
    };
  }
}
