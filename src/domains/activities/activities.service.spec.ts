import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogType, ActivityLog } from '@prisma/client';

describe('ActivitiesService (최근 활동 내역)', () => {
  let service: ActivitiesService;

  // 서비스 내부에서 사용하는 모든 Prisma 모델 및 메서드 Mocking
  const mockPrismaService = {
    userAuthIdentity: {
      findUnique: jest.fn(),
    },
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    expense: {
      findMany: jest.fn(),
    },
    chore: {
      findMany: jest.fn(),
    },
    rule: {
      findMany: jest.fn(),
    },
    supply: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGroupMembership', () => {
    it('인증된 유저이자 그룹 멤버일 경우 통과해야 한다', async () => {
      mockPrismaService.userAuthIdentity.findUnique.mockResolvedValue({ userId: BigInt(2) });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({ id: BigInt(1), userId: BigInt(2), groupId: BigInt(1) });

      await expect(service.validateGroupMembership('cognito-sub-123', 1)).resolves.not.toThrow();
    });

    it('인증되지 않은 유저일 경우 ForbiddenException을 던져야 한다', async () => {
      mockPrismaService.userAuthIdentity.findUnique.mockResolvedValue(null);

      await expect(service.validateGroupMembership('cognito-sub-invalid', 1)).rejects.toThrow(ForbiddenException);
    });

    it('그룹 멤버가 아닐 경우 ForbiddenException을 던져야 한다', async () => {
      mockPrismaService.userAuthIdentity.findUnique.mockResolvedValue({ userId: BigInt(2) });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.validateGroupMembership('cognito-sub-123', 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logActivity (ACT-LOG-01)', () => {
    it('활동 로그를 데이터베이스에 정상적으로 자동 기록해야 한다', async () => {
      const createDto = {
        groupId: 1,
        userId: 2,
        type: ActivityLogType.EXPENSE_CREATED,
        refId: 123,
        description: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.',
      };

      const mockCreatedLog = {
        id: BigInt(10),
        groupId: BigInt(createDto.groupId),
        userId: BigInt(createDto.userId),
        type: createDto.type,
        refId: BigInt(createDto.refId),
        description: createDto.description,
        createdAt: new Date(),
      } as ActivityLog;

      mockPrismaService.activityLog.create.mockResolvedValue(mockCreatedLog);

      const result = await service.logActivity(createDto);

      expect(mockPrismaService.activityLog.create).toHaveBeenCalledWith({
        data: {
          groupId: BigInt(createDto.groupId),
          userId: BigInt(createDto.userId),
          type: createDto.type,
          refId: BigInt(createDto.refId),
          description: createDto.description,
        },
      });
      expect(result).toEqual({
        message: '활동 로그가 백그라운드에 자동으로 기록되었습니다.',
        activityId: 10,
      });
    });
  });

  describe('getActivities (ACT-LIST-01)', () => {
    it('동기화 과정을 거친 뒤 포맷팅된 활동 내역 목록을 정상 반환해야 한다', async () => {
      const queryDto = {
        groupId: 1,
        page: 1,
      };

      // 동기화 루프용 기본 Mock 반환값 설정
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.chore.findMany.mockResolvedValue([]);
      mockPrismaService.rule.findMany.mockResolvedValue([]);
      mockPrismaService.supply.findMany.mockResolvedValue([]);
      mockPrismaService.groupMember.findMany.mockResolvedValue([]);

      const mockLogsWithUser = [
        {
          id: BigInt(10),
          groupId: BigInt(1),
          userId: BigInt(2),
          type: ActivityLogType.EXPENSE_CREATED,
          refId: BigInt(123),
          description: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.',
          createdAt: new Date('2026-07-02T16:40:00Z'),
          user: {
            id: BigInt(2),
            nickname: '지현',
          },
        },
        {
          id: BigInt(9),
          groupId: BigInt(1),
          userId: BigInt(3),
          type: ActivityLogType.CHORE_DONE,
          refId: BigInt(45),
          description: '지현님이 [화장실 청소]를 완료했습니다.',
          createdAt: new Date('2026-07-02T15:00:00Z'),
          user: {
            id: BigInt(3),
            nickname: '룸메이트',
          },
        },
      ];

      mockPrismaService.activityLog.findMany.mockResolvedValue(mockLogsWithUser);

      const result = await service.getActivities(queryDto);

      expect(mockPrismaService.activityLog.findMany).toHaveBeenCalledWith({
        where: { groupId: BigInt(1) },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });

      expect(result).toEqual({
        statusCode: 200,
        data: [
          {
            id: 10,
            type: ActivityLogType.EXPENSE_CREATED,
            description: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.',
            createdAt: new Date('2026-07-02T16:40:00Z'),
            user: {
              id: 2,
              nickname: '지현',
            },
          },
          {
            id: 9,
            type: ActivityLogType.CHORE_DONE,
            description: '지현님이 [화장실 청소]를 완료했습니다.',
            createdAt: new Date('2026-07-02T15:00:00Z'),
            user: {
              id: 3,
              nickname: '룸메이트',
            },
          },
        ],
        error: null,
      });
    });

    it('활동 기록이 없을 경우 빈 배열을 포맷에 맞게 반환해야 한다', async () => {
      const queryDto = { groupId: 1, page: 1 };

      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.chore.findMany.mockResolvedValue([]);
      mockPrismaService.rule.findMany.mockResolvedValue([]);
      mockPrismaService.supply.findMany.mockResolvedValue([]);
      mockPrismaService.groupMember.findMany.mockResolvedValue([]);
      mockPrismaService.activityLog.findMany.mockResolvedValue([]);

      const result = await service.getActivities(queryDto);

      expect(result).toEqual({
        statusCode: 200,
        data: [],
        error: null,
      });
    });
  });
});