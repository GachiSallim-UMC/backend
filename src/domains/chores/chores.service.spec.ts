import { Test, TestingModule } from '@nestjs/testing';
import { ChoreCategory, ChoreStatus, RepeatType, Weekday } from '@prisma/client';
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
        },
        BigInt(1),
      );

      const createCalls = prisma.chore.create.mock.calls as [{ data: Record<string, unknown> }][];
      const createArgs = createCalls[0][0];

      expect(createArgs.data.dueDate).toBeNull();
      expect(createArgs.data.repeatDays).toEqual([]);
      expect(createArgs.data.memo).toBeNull();
      expect(result.dueDate).toBeNull();
      expect(result.category).toBe(ChoreCategory.DISHWASHING);
    });
  });

  describe('completeChore', () => {
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
