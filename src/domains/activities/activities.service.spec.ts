import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogType, ActivityLog } from '@prisma/client';

describe('ActivitiesService (최근 활동 내역)', () => {
  let service: ActivitiesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    activityLog: {
      create: jest.fn(),
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
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

      const mockCreatedLog: ActivityLog = {
        id: BigInt(10),
        groupId: BigInt(createDto.groupId),
        userId: BigInt(createDto.userId),
        type: createDto.type,
        refId: BigInt(createDto.refId),
        description: createDto.description,
        createdAt: new Date(),
      };

      const createSpy = jest.spyOn(prisma.activityLog, 'create');
      createSpy.mockResolvedValue(mockCreatedLog);

      const result = await service.logActivity(createDto);

      // 서비스 내부에서 BigInt로 변환하여 Prisma에 주입하므로, 매칭값을 정확히 대응
      expect(createSpy).toHaveBeenCalledWith({
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
    it('활동 내역이 존재할 때 타겟 라우팅 경로를 포함한 최신순 목록을 반환해야 한다', async () => {
      const queryDto = {
        groupId: 1,
        page: 1,
      };

      const mockLogs: ActivityLog[] = [
        {
          id: BigInt(10),
          groupId: BigInt(1),
          userId: BigInt(2),
          type: ActivityLogType.EXPENSE_CREATED,
          refId: BigInt(123),
          description: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.',
          createdAt: new Date('2026-07-02T16:40:00Z'),
        },
        {
          id: BigInt(9),
          groupId: BigInt(1),
          userId: BigInt(3),
          type: ActivityLogType.CHORE_DONE,
          refId: BigInt(45),
          description: '지현님이 [화장실 청소]를 완료했습니다.',
          createdAt: new Date('2026-07-02T15:00:00Z'),
        },
      ];

      const findManySpy = jest.spyOn(prisma.activityLog, 'findMany');
      findManySpy.mockResolvedValue(mockLogs);

      const result = await service.getActivities(queryDto);

      // 서비스 내부에서 BigInt(groupId)로 비교 조건이 들어가므로 매칭값 보정
      expect(findManySpy).toHaveBeenCalledWith({
        where: { groupId: BigInt(1) },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });

      const activities = result as { data: unknown[] };
      expect(activities.data).toHaveLength(2);
      expect(activities.data[0]).toEqual({
        id: 10,
        groupId: 1,
        userId: 2,
        type: ActivityLogType.EXPENSE_CREATED,
        refId: 123,
        targetRoute: 'EXP-123',
        description: '지현님이 새로운 생활비 [5월 관리비] 정산을 요청했습니다.',
        createdAt: expect.any(Date) as Date,
      });
    });

    it('활동 기록이 하나도 없을 때 기획서 빈 상태 조건에 맞는 빈 배열과 메시지를 반환해야 한다', async () => {
      const queryDto = { groupId: 1, page: 1 };

      const findManySpy = jest.spyOn(prisma.activityLog, 'findMany');
      findManySpy.mockResolvedValue([]);

      const result = await service.getActivities(queryDto);

      expect(result).toEqual({
        data: [],
        message: '최근 활동이 없습니다.',
      });
    });
  });
});