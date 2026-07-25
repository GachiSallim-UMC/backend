import { Test, TestingModule } from '@nestjs/testing';
import { ChoreCategory, ChoreStatus, CustomOption, RepeatType, Weekday } from '@prisma/client';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ChoresService } from './chores.service';

describe('ChoresService', () => {
  let service: ChoresService;
  let prisma: {
    chore: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    groupMember: { findUnique: jest.Mock };
    chatRoom: { findUnique: jest.Mock };
    chatRoomMember: { findUnique: jest.Mock };
    message: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      chore: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      groupMember: { findUnique: jest.fn() },
      chatRoom: { findUnique: jest.fn() },
      chatRoomMember: { findUnique: jest.fn() },
      message: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ChoresService);
  });

  describe('createChore', () => {
    it('dueDate가 startDate보다 빠르면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            groupId: 1,
            title: '설거지',
            category: ChoreCategory.DISHWASHING,
            assigneeId: 1,
            startDate: '2026-07-10',
            dueDate: '2026-07-01',
            repeatType: RepeatType.NONE,
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('repeatType이 WEEKLY인데 repeatDays가 비어 있으면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            groupId: 1,
            title: '분리수거',
            category: ChoreCategory.TRASH,
            assigneeId: 1,
            startDate: '2026-07-01',
            repeatType: RepeatType.WEEKLY,
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('repeatType이 WEEKLY가 아닌데 repeatDays를 보내면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            groupId: 1,
            title: '분리수거',
            category: ChoreCategory.TRASH,
            assigneeId: 1,
            startDate: '2026-07-01',
            repeatType: RepeatType.DAILY,
            repeatDays: [Weekday.MON],
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('dueDate를 생략하면 dueDate가 null로 저장된다', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ id: BigInt(1), leftAt: null });
      prisma.chore.create.mockResolvedValue({
        id: BigInt(11),
        parentId: null,
        groupId: BigInt(1),
        title: '설거지',
        category: ChoreCategory.DISHWASHING,
        startDate: new Date('2026-07-01T00:00:00Z'),
        dueDate: null,
        repeatType: RepeatType.NONE,
        customOption: null,
        repeatInterval: null,
        repeatDays: [],
        memo: null,
        status: ChoreStatus.PENDING,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        assignee: { id: BigInt(1), nickname: '홍길동' },
        completer: null,
        creator: { id: BigInt(1), nickname: '홍길동' },
      });

      const result = await service.createChore(
        {
          groupId: 1,
          title: '설거지',
          category: ChoreCategory.DISHWASHING,
          assigneeId: 1,
          startDate: '2026-07-01',
          repeatType: RepeatType.NONE,
        },
        BigInt(1),
      );

      const createCalls = prisma.chore.create.mock.calls as [{ data: Record<string, unknown> }][];
      const createArgs = createCalls[0][0];

      expect(createArgs.data.dueDate).toBeNull();
      expect(createArgs.data.repeatDays).toEqual([]);
      expect(createArgs.data.memo).toBeNull();
      expect(createArgs.data.customOption).toBeNull();
      expect(createArgs.data.repeatInterval).toBeNull();
      expect(result.dueDate).toBeNull();
      expect(result.category).toBe(ChoreCategory.DISHWASHING);
    });
  });

  describe('createChore - 반복 설정 검증', () => {
    const base = {
      groupId: 1,
      title: '분리수거',
      category: ChoreCategory.TRASH,
      assigneeId: 1,
      startDate: '2026-07-27',
    };

    it('CUSTOM인데 customOption이 없으면 400 예외를 던진다', async () => {
      await expect(
        service.createChore({ ...base, repeatType: RepeatType.CUSTOM }, BigInt(1)),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('CUSTOM이 아닌데 customOption을 보내면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          { ...base, repeatType: RepeatType.DAILY, customOption: CustomOption.EVERY_N_DAYS },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('EVERY_N_DAYS인데 repeatInterval이 없으면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            ...base,
            repeatType: RepeatType.CUSTOM,
            customOption: CustomOption.EVERY_N_DAYS,
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('SPECIFIC_DAYS인데 repeatInterval을 보내면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            ...base,
            repeatType: RepeatType.CUSTOM,
            customOption: CustomOption.SPECIFIC_DAYS,
            repeatDays: [Weekday.MON],
            repeatInterval: 2,
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    it('SPECIFIC_DAYS인데 repeatDays가 비어 있으면 400 예외를 던진다', async () => {
      await expect(
        service.createChore(
          {
            ...base,
            repeatType: RepeatType.CUSTOM,
            customOption: CustomOption.SPECIFIC_DAYS,
          },
          BigInt(1),
        ),
      ).rejects.toThrow(BusinessException);

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });
  });

  describe('completeChore', () => {
    /** completeChore가 참조하는 레코드를 구성한다. 기본값은 반복 없음(NONE). */
    function arrangeComplete(overrides: Record<string, unknown> = {}) {
      const record = {
        id: BigInt(1),
        parentId: null,
        groupId: BigInt(1),
        title: '설거지',
        category: ChoreCategory.DISHWASHING,
        assigneeId: BigInt(1),
        startDate: new Date('2026-07-27T00:00:00Z'),
        dueDate: null,
        repeatType: RepeatType.NONE,
        customOption: null,
        repeatInterval: null,
        repeatDays: [],
        memo: null,
        status: ChoreStatus.DONE,
        completedBy: BigInt(1),
        completedAt: new Date('2026-07-27T10:00:00Z'),
        createdBy: BigInt(1),
        assignee: { id: BigInt(1), nickname: '홍길동' },
        completer: { id: BigInt(1), nickname: '홍길동' },
        creator: { id: BigInt(1), nickname: '홍길동' },
        ...overrides,
      };

      prisma.chore.findUnique.mockResolvedValue({ ...record, status: ChoreStatus.PENDING });
      prisma.chore.update.mockResolvedValue(record);
      prisma.chore.create.mockResolvedValue({
        id: BigInt(99),
        parentId: BigInt(1),
        startDate: new Date('2026-07-28T00:00:00Z'),
        dueDate: null,
        status: ChoreStatus.PENDING,
      });

      return record;
    }

    /** 다음 회차 생성 시 prisma.chore.create에 전달된 data */
    function createdData(): Record<string, unknown> {
      const calls = prisma.chore.create.mock.calls as [{ data: Record<string, unknown> }][];

      return calls[0][0].data;
    }

    function createdDateOnly(field: 'startDate' | 'dueDate'): string | null {
      const value = createdData()[field] as Date | null;

      return value === null ? null : value.toISOString().slice(0, 10);
    }

    it('존재하지 않는 choreId면 404 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue(null);

      await expect(service.completeChore(BigInt(999), BigInt(1))).rejects.toThrow(
        BusinessException,
      );
    });

    it('이미 완료된 집안일이면 409 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue({
        id: BigInt(1),
        status: ChoreStatus.DONE,
      });

      await expect(service.completeChore(BigInt(1), BigInt(1))).rejects.toThrow(BusinessException);

      expect(prisma.chore.update).not.toHaveBeenCalled();
    });

    it('반복이 없으면 다음 회차를 생성하지 않는다', async () => {
      arrangeComplete({ repeatType: RepeatType.NONE, dueDate: new Date('2026-07-29T00:00:00Z') });

      await service.completeChore(BigInt(1), BigInt(1));

      expect(prisma.chore.create).not.toHaveBeenCalled();
    });

    describe('CUSTOM 반복 주기', () => {
      it('EVERY_N_DAYS(3)이면 3일 뒤로 생성한다', async () => {
        arrangeComplete({
          repeatType: RepeatType.CUSTOM,
          customOption: CustomOption.EVERY_N_DAYS,
          repeatInterval: 3,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-30');
      });

      it('EVERY_N_WEEKS(2)이면 14일 뒤로 생성한다', async () => {
        arrangeComplete({
          repeatType: RepeatType.CUSTOM,
          customOption: CustomOption.EVERY_N_WEEKS,
          repeatInterval: 2,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-08-10');
      });

      it('SPECIFIC_DAYS이면 다음 지정 요일로 생성한다', async () => {
        // 2026-07-27은 월요일 -> 다음 지정 요일은 목요일(07-30)
        arrangeComplete({
          repeatType: RepeatType.CUSTOM,
          customOption: CustomOption.SPECIFIC_DAYS,
          repeatDays: [Weekday.MON, Weekday.THU],
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-30');
      });

      it('EVERY_N_MONTHS(1)도 월말 오버플로를 보정한다', async () => {
        arrangeComplete({
          startDate: new Date('2026-01-31T00:00:00Z'),
          repeatType: RepeatType.CUSTOM,
          customOption: CustomOption.EVERY_N_MONTHS,
          repeatInterval: 1,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-02-28');
      });
    });

    describe('MONTHLY 월말 보정', () => {
      it('1월 31일의 다음 회차는 3월 3일이 아니라 2월 28일이다', async () => {
        arrangeComplete({
          startDate: new Date('2026-01-31T00:00:00Z'),
          repeatType: RepeatType.MONTHLY,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-02-28');
      });
    });

    describe('반복 종료일', () => {
      it('종료일은 회차마다 밀리지 않고 그대로 유지된다', async () => {
        arrangeComplete({
          repeatType: RepeatType.DAILY,
          dueDate: new Date('2026-07-29T00:00:00Z'),
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-28');
        expect(createdDateOnly('dueDate')).toBe('2026-07-29');
      });

      it('다음 회차가 종료일과 같은 날이면 생성한다 (경계 포함)', async () => {
        arrangeComplete({
          startDate: new Date('2026-07-28T00:00:00Z'),
          repeatType: RepeatType.DAILY,
          dueDate: new Date('2026-07-29T00:00:00Z'),
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(prisma.chore.create).toHaveBeenCalledTimes(1);
        expect(createdDateOnly('startDate')).toBe('2026-07-29');
      });

      it('다음 회차가 종료일을 넘으면 생성하지 않는다', async () => {
        arrangeComplete({
          startDate: new Date('2026-07-29T00:00:00Z'),
          repeatType: RepeatType.DAILY,
          dueDate: new Date('2026-07-29T00:00:00Z'),
        });

        const result = await service.completeChore(BigInt(1), BigInt(1));

        expect(prisma.chore.create).not.toHaveBeenCalled();
        expect(result).not.toHaveProperty('nextOccurrence');
      });

      it('종료일이 없으면 계속 생성한다', async () => {
        arrangeComplete({ repeatType: RepeatType.DAILY, dueDate: null });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(prisma.chore.create).toHaveBeenCalledTimes(1);
        expect(createdDateOnly('dueDate')).toBeNull();
      });
    });
  });

  describe('shareChore', () => {
    const chore = {
      id: BigInt(11),
      groupId: BigInt(1),
      title: '설거지',
      dueDate: new Date('2026-07-05T00:00:00Z'),
      status: ChoreStatus.PENDING,
      assignee: { id: BigInt(5), nickname: '홍길동' },
      completer: null,
      creator: { id: BigInt(5), nickname: '홍길동' },
    };

    it('존재하지 않는 choreId면 404 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue(null);

      await expect(service.shareChore(BigInt(999), BigInt(5), BigInt(3))).rejects.toThrow(
        BusinessException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('채팅방이 집안일과 다른 그룹이면 400 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue(chore);
      prisma.chatRoom.findUnique.mockResolvedValue({ id: BigInt(3), groupId: BigInt(2) });

      await expect(service.shareChore(BigInt(11), BigInt(5), BigInt(3))).rejects.toThrow(
        BusinessException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('발신자가 채팅방 멤버가 아니면 404 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue(chore);
      prisma.chatRoom.findUnique.mockResolvedValue({ id: BigInt(3), groupId: BigInt(1) });
      prisma.chatRoomMember.findUnique.mockResolvedValue(null);

      await expect(service.shareChore(BigInt(11), BigInt(5), BigInt(3))).rejects.toThrow(
        BusinessException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('정상 공유 시 CARD_CHORE 메시지를 생성하고 공유 카드를 반환한다', async () => {
      prisma.chore.findUnique.mockResolvedValue(chore);
      prisma.chatRoom.findUnique.mockResolvedValue({ id: BigInt(3), groupId: BigInt(1) });
      prisma.chatRoomMember.findUnique.mockResolvedValue({ id: BigInt(100) });
      prisma.message.create.mockResolvedValue({
        id: BigInt(305),
        createdAt: new Date('2026-07-03T12:10:00Z'),
      });

      const result = await service.shareChore(BigInt(11), BigInt(5), BigInt(3), '확인해주세요');

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        choreId: 11,
        chatMessageId: 305,
        shareCard: {
          title: '설거지',
          assignee: '홍길동',
          dueDate: '2026-07-05',
          status: ChoreStatus.PENDING,
        },
        sentAt: '2026-07-03T12:10:00Z',
      });
    });
  });
});
