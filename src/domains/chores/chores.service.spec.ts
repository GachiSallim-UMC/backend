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
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    groupMember: { findUnique: jest.Mock };
    chatRoom: { findUnique: jest.Mock };
    chatRoomMember: { findUnique: jest.Mock };
    message: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      chore: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      groupMember: { findUnique: jest.fn() },
      chatRoom: { findUnique: jest.fn() },
      chatRoomMember: { findUnique: jest.fn() },
      message: { create: jest.fn() },
      // 트랜잭션 콜백에 동일한 mock client를 그대로 넘겨 준다.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
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
    // 다음 회차는 완료 시각을 기준으로 계산하므로 시계를 고정한다. (#159)
    // 기본값은 KST 2026-07-27(월) 19:00.
    const DEFAULT_NOW = '2026-07-27T10:00:00Z';

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date(DEFAULT_NOW));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /** 완료 시각을 옮긴다. 다음 회차 계산의 기준일이 바뀐다. */
    function freezeNow(iso: string) {
      jest.setSystemTime(new Date(iso));
    }

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

    describe('다음 회차 기준일 (#159)', () => {
      it('DAILY는 완료일 다음 날로 생성한다', async () => {
        arrangeComplete({ repeatType: RepeatType.DAILY });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-28');
      });

      it('완료가 밀려도 시작일이 아니라 완료일 다음 날로 생성한다', async () => {
        // 07-25에 시작한 매일 집안일을 07-28에 완료 -> 07-26(X), 07-29(O)
        freezeNow('2026-07-28T10:00:00Z');
        arrangeComplete({
          startDate: new Date('2026-07-25T00:00:00Z'),
          repeatType: RepeatType.DAILY,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-29');
      });

      it('완료가 하루 밀려도 다음 회차가 오늘로 생성되지 않는다', async () => {
        // 프론트 제보 케이스: 07-27 등록 -> 07-28 완료 시 07-28(오늘)로 생성되던 문제
        freezeNow('2026-07-28T10:00:00Z');
        arrangeComplete({
          startDate: new Date('2026-07-27T00:00:00Z'),
          repeatType: RepeatType.DAILY,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-29');
      });

      it('시작일보다 먼저 완료하면 시작일을 기준으로 계산한다', async () => {
        // 07-30 시작 예정인 집안일을 07-28에 미리 완료 -> 07-29(X), 07-31(O)
        freezeNow('2026-07-28T10:00:00Z');
        arrangeComplete({
          startDate: new Date('2026-07-30T00:00:00Z'),
          repeatType: RepeatType.DAILY,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-31');
      });

      it('완료 시각은 UTC가 아니라 한국 달력 날짜로 해석한다', async () => {
        // 2026-07-28T15:30:00Z = KST 07-29 00:30 -> 다음 회차는 07-30
        freezeNow('2026-07-28T15:30:00Z');
        arrangeComplete({
          startDate: new Date('2026-07-25T00:00:00Z'),
          repeatType: RepeatType.DAILY,
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-30');
      });

      it('WEEKLY도 완료일 기준으로 다음 지정 요일을 찾는다', async () => {
        // 07-29(수)에 완료, 지정 요일 월/목 -> 07-30(목)
        freezeNow('2026-07-29T10:00:00Z');
        arrangeComplete({
          startDate: new Date('2026-07-27T00:00:00Z'),
          repeatType: RepeatType.WEEKLY,
          repeatDays: [Weekday.MON, Weekday.THU],
        });

        await service.completeChore(BigInt(1), BigInt(1));

        expect(createdDateOnly('startDate')).toBe('2026-07-30');
      });
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
        freezeNow('2026-01-31T10:00:00Z');
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
        freezeNow('2026-01-31T10:00:00Z');
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

  describe('incompleteChore (#159)', () => {
    /** 완료 상태의 chore와, 되돌린 뒤의 update 결과를 준비한다. */
    function arrangeIncomplete(children: { id: bigint; status: ChoreStatus }[] = []) {
      prisma.chore.findUnique.mockResolvedValue({
        id: BigInt(1),
        groupId: BigInt(1),
        status: ChoreStatus.DONE,
      });
      prisma.chore.findMany.mockResolvedValue(children);
      prisma.chore.update.mockResolvedValue({
        id: BigInt(1),
        status: ChoreStatus.PENDING,
        completedBy: null,
        completedAt: null,
        completer: null,
      });
    }

    it('존재하지 않는 choreId면 404 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue(null);

      await expect(service.incompleteChore(BigInt(999))).rejects.toThrow(BusinessException);
    });

    it('완료 상태가 아니면 409 예외를 던진다', async () => {
      prisma.chore.findUnique.mockResolvedValue({ id: BigInt(1), status: ChoreStatus.PENDING });

      await expect(service.incompleteChore(BigInt(1))).rejects.toThrow(BusinessException);

      expect(prisma.chore.update).not.toHaveBeenCalled();
    });

    it('status를 PENDING으로 되돌리고 완료 정보를 초기화한다', async () => {
      arrangeIncomplete();

      const result = await service.incompleteChore(BigInt(1));

      expect(prisma.chore.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(1) },
          data: { status: ChoreStatus.PENDING, completedBy: null, completedAt: null },
        }),
      );
      expect(result).toMatchObject({
        choreId: 1,
        status: ChoreStatus.PENDING,
        completedBy: null,
        completedAt: null,
      });
    });

    it('완료 시 생성된 다음 회차를 함께 삭제한다', async () => {
      arrangeIncomplete([{ id: BigInt(99), status: ChoreStatus.PENDING }]);

      const result = await service.incompleteChore(BigInt(1));

      expect(prisma.chore.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [BigInt(99)] } },
      });
      expect(result.removedNextOccurrenceIds).toEqual([99]);
    });

    it('다음 회차가 없으면 삭제를 호출하지 않는다', async () => {
      arrangeIncomplete();

      const result = await service.incompleteChore(BigInt(1));

      expect(prisma.chore.deleteMany).not.toHaveBeenCalled();
      expect(result.removedNextOccurrenceIds).toEqual([]);
    });

    it('다음 회차가 이미 완료됐으면 409 예외를 던진다', async () => {
      arrangeIncomplete([{ id: BigInt(99), status: ChoreStatus.DONE }]);

      await expect(service.incompleteChore(BigInt(1))).rejects.toThrow(BusinessException);

      expect(prisma.chore.deleteMany).not.toHaveBeenCalled();
      expect(prisma.chore.update).not.toHaveBeenCalled();
    });

    it('회차 삭제와 상태 복원을 하나의 트랜잭션에서 처리한다', async () => {
      arrangeIncomplete([{ id: BigInt(99), status: ChoreStatus.PENDING }]);

      await service.incompleteChore(BigInt(1));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
