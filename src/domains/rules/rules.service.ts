import { Injectable } from '@nestjs/common';
import { MessageType } from '@prisma/client';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules-query.dto';
import { RuleAgreementResponseDto } from './dto/rule-agreement-response.dto';
import { RuleListResponseDto } from './dto/rule-list-response.dto';
import { RuleResponseDto } from './dto/rule-response.dto';
import { ShareRuleResponseDto } from './dto/share-rule-response.dto';
import { RuleAgreementStatusValue, UpdateRuleAgreementDto } from './dto/update-rule-agreement.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getRules(query: ListRulesQueryDto): Promise<RuleListResponseDto> {
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
        const disagreedCount = agreements.filter((agreement) => agreement.status === 'DISAGREED').length;
        const pendingCount = agreements.filter((agreement) => agreement.status === 'PENDING').length;

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

  async createRule(dto: CreateRuleDto, currentUserId: bigint): Promise<RuleResponseDto> {
    const group = await this.prisma.group.findUnique({ where: { id: BigInt(dto.groupId) } });
    if (!group) {
      throw new BusinessException(ErrorCode.RULE_GROUP_NOT_FOUND);
    }

    const category = await this.prisma.ruleCategory.findUnique({ where: { id: BigInt(dto.categoryId) } });
    if (!category) {
      throw new BusinessException(ErrorCode.RULE_CATEGORY_NOT_FOUND);
    }

    const rule = await this.prisma.rule.create({
      data: {
        groupId: BigInt(dto.groupId),
        categoryId: BigInt(dto.categoryId),
        userId: currentUserId,
        title: dto.title,
        description: dto.description,
        status: 'ACTIVE',
      },
    });

    return { ruleId: Number(rule.id), title: rule.title };
  }

  async updateRule(ruleId: number, dto: UpdateRuleDto, currentUserId: bigint): Promise<RuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: BigInt(ruleId) } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    if (rule.userId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    const category = await this.prisma.ruleCategory.findUnique({ where: { id: BigInt(dto.categoryId) } });
    if (!category) {
      throw new BusinessException(ErrorCode.RULE_CATEGORY_NOT_FOUND);
    }

    const updatedRule = await this.prisma.rule.update({
      where: { id: BigInt(ruleId) },
      data: {
        categoryId: BigInt(dto.categoryId),
        title: dto.title,
        description: dto.description,
        status: dto.status,
      },
    });

    return { ruleId: Number(updatedRule.id), title: updatedRule.title };
  }

  async updateRuleAgreement(
    ruleId: number,
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
    const agreement = await this.prisma.ruleAgreement.upsert({
      where: {
        ruleId_userId: {
          ruleId: BigInt(ruleId),
          userId: currentUserId,
        },
      },
      create: {
        ruleId: BigInt(ruleId),
        userId: currentUserId,
        status: dto.status,
        confirmedAt,
      },
      update: {
        status: dto.status,
        confirmedAt,
      },
    });

    return {
      agreementId: Number(agreement.id),
      ruleId: Number(agreement.ruleId),
      userId: Number(agreement.userId),
      status: agreement.status,
      confirmedAt: agreement.confirmedAt?.toISOString() ?? null,
    };
  }

  async shareRule(ruleId: number, senderId: bigint): Promise<ShareRuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: BigInt(ruleId) } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    const chatRoom = await this.prisma.chatRoom.findFirst({
      where: {
        groupId: rule.groupId,
        isDefault: true,
      },
    });
    if (!chatRoom) {
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
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
      throw new BusinessException(ErrorCode.CHAT_ROOM_MEMBER_NOT_FOUND);
    }

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: chatRoom.id,
        senderId,
        type: MessageType.CARD_RULE,
        content: '',
        refId: rule.id,
      },
    });

    return {
      ruleId: Number(rule.id),
      messageId: Number(message.id),
    };
  }

  async deleteRule(ruleId: number, currentUserId: bigint): Promise<RuleResponseDto> {
    const rule = await this.prisma.rule.findUnique({ where: { id: BigInt(ruleId) } });
    if (!rule) {
      throw new BusinessException(ErrorCode.COMMON_NOT_FOUND);
    }

    if (rule.userId !== currentUserId) {
      throw new BusinessException(ErrorCode.COMMON_FORBIDDEN);
    }

    const deletedRule = await this.prisma.rule.delete({ where: { id: BigInt(ruleId) } });

    return { ruleId: Number(deletedRule.id), title: deletedRule.title };
  }
}
