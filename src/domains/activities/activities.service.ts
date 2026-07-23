import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';
import { ActivityLogType } from '@prisma/client';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 그룹 멤버십 권한 검증
   * @param cognitoSub Cognito 사용자 식별자 (string)
   * @param groupId 조회하려는 그룹 ID (number)
   */
  async validateGroupMembership(cognitoSub: string, groupId: number) {
    // 1. UserAuthIdentity 테이블에서 cognitoSub로 해당 연동 계정 조회
    const authIdentity = await this.prisma.userAuthIdentity.findUnique({
      where: { cognitoSub },
      select: { userId: true },
    });

    if (!authIdentity) {
      throw new ForbiddenException('존재하지 않거나 인증되지 않은 사용자입니다.');
    }

    // 2. 해당 유저가 해당 그룹의 활성 멤버인지 검증
    const member = await this.prisma.groupMember.findFirst({
      where: {
        userId: authIdentity.userId,
        groupId: BigInt(groupId),
        leftAt: null, // 그룹을 탈퇴하지 않은 활성 멤버만 허용
      },
    });

    if (!member) {
      throw new ForbiddenException('해당 그룹의 활동 내역을 조회할 권한이 없습니다.');
    }
  }

  // 1. 활동 자동/백그라운드 기록 (도메인 서비스 내부 호출용)
  async logActivity(createActivityDto: CreateActivityDto) {
    const { groupId, userId, type, refId, description } = createActivityDto;

    // Prisma Schema의 BigInt 타입 제약에 맞게 명시적 변환
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

  // 2. 활동 목록 조회 및 타임라인 상세 라우팅 (ACT-LIST-01)
  async getActivities(query: GetActivityQueryDto) {
    const { groupId, type, userId, page = 1 } = query;
    const limit = 10;
    const skip = (page - 1) * limit;

    const logs = await this.prisma.activityLog.findMany({
      where: {
        groupId: BigInt(groupId),
        ...(type && { type }),
        ...(userId && { userId: BigInt(userId) }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    // 빈 상태일 때: 메시지와 빈 배열을 하나의 통일된 객체 포맷으로 반환
    if (logs.length === 0) {
      return {
        data: [],
        message: '최근 활동이 없습니다.',
      };
    }

    const formattedActivities = logs.map((log) => {
      const refIdNum = log.refId ? Number(log.refId) : null;
      return {
        id: Number(log.id),
        groupId: Number(log.groupId),
        userId: Number(log.userId),
        type: log.type,
        refId: refIdNum,
        targetRoute: refIdNum ? this.getTargetRoute(log.type, refIdNum) : 'MAIN',
        description: log.description,
        createdAt: log.createdAt,
      };
    });

    // 데이터가 존재할 때도 동일하게 { data: [...] } 포맷으로 반환하여 일관성 유지
    return {
      data: formattedActivities,
    };
  }

  // parameter 타입을 string 대신 Prisma의 ActivityLogType Enum으로 지정하여 린트 컴파일 통과
  private getTargetRoute(type: ActivityLogType, refId: number): string {
    switch (type) {
      case 'CHORE_CREATED':
      case 'CHORE_DONE':
        return `CHO-${refId.toString().padStart(3, '0')}`;
      case 'EXPENSE_CREATED':
      case 'EXPENSE_DONE':
        return `EXP-${refId.toString().padStart(3, '0')}`;
      default:
        return 'MAIN';
    }
  }
}