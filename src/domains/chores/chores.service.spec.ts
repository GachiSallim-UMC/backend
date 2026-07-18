import { Test, TestingModule } from '@nestjs/testing';
import { ChoreStatus, RepeatType } from '@prisma/client';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ChoreDueSchedulerService } from './chore-due-scheduler.service';
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
    };
    groupMember: { findUnique: jest.Mock };
    chatRoom: { findUnique: jest.Mock };
    chatRoomMember: { findUnique: jest.Mock };
    message: { create: jest.Mock };
  };
  const choreDueScheduler = {
    synchronize: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    prisma = {
      chore: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      groupMember: { findUnique: jest.fn() },
      chatRoom: { findUnique: jest.fn() },
      chatRoomMember: { findUnique: jest.fn() },
      message: { create: jest.fn() },
    };
    choreDueScheduler.synchronize.mockReset().mockResolvedValue(undefined);
    choreDueScheduler.delete.mockReset().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChoresService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChoreDueSchedulerService, useValue: choreDueScheduler },
      ],
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

    it('마감일이 있으면 생성된 집안일의 one-time schedule을 동기화한다', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ leftAt: null });
      const chore = choreRecord();
      prisma.chore.create.mockResolvedValue(chore);

      await service.createChore(
        {
          groupId: 1,
          title: '설거지',
          assigneeId: 5,
          startDate: '2026-07-18',
          dueDate: '2026-07-20',
          repeatType: RepeatType.NONE,
        },
        5n,
      );

      expect(choreDueScheduler.synchronize).toHaveBeenCalledWith(chore);
    });
  });

  describe('updateChore', () => {
    it('마감일이나 담당자 변경 후 같은 집안일 schedule을 갱신한다', async () => {
      const existing = choreRecord();
      const updated = { ...existing, assigneeId: 6n, assignee: { id: 6n, nickname: '김영희' } };
      prisma.chore.findUnique.mockResolvedValue(existing);
      prisma.groupMember.findUnique.mockResolvedValue({ leftAt: null });
      prisma.chore.update.mockResolvedValue(updated);

      await service.updateChore(11n, {
        title: '설거지',
        assigneeId: 6,
        startDate: '2026-07-18',
        dueDate: '2026-07-21',
        repeatType: RepeatType.NONE,
      });

      expect(choreDueScheduler.synchronize).toHaveBeenCalledWith(updated);
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

    it('완료 시 기존 schedule을 취소하고 반복 항목의 새 schedule을 만든다', async () => {
      const existing = choreRecord({ repeatType: RepeatType.DAILY });
      const updated = choreRecord({
        repeatType: RepeatType.DAILY,
        status: ChoreStatus.DONE,
        completedBy: 5n,
        completedAt: new Date('2026-07-18T03:00:00.000Z'),
        completer: { id: 5n, nickname: '홍길동' },
      });
      const next = {
        id: 12n,
        parentId: 11n,
        assigneeId: 5n,
        dueDate: new Date('2026-07-21T00:00:00.000Z'),
        status: ChoreStatus.PENDING,
      };
      prisma.chore.findUnique.mockResolvedValue(existing);
      prisma.chore.update.mockResolvedValue(updated);
      prisma.chore.create.mockResolvedValue(next);

      await service.completeChore(11n, 5n);

      expect(choreDueScheduler.delete).toHaveBeenCalledWith(11n);
      expect(choreDueScheduler.synchronize).toHaveBeenCalledWith(next);
    });
  });

  describe('deleteChore', () => {
    it('삭제 후 남아 있는 schedule을 멱등 취소한다', async () => {
      prisma.chore.findUnique.mockResolvedValue(choreRecord());
      prisma.chore.delete.mockResolvedValue({});

      await service.deleteChore(11n, 5n);

      expect(choreDueScheduler.delete).toHaveBeenCalledWith(11n);
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

  function choreRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 11n,
      parentId: null,
      groupId: 1n,
      title: '설거지',
      assigneeId: 5n,
      startDate: new Date('2026-07-18T00:00:00.000Z'),
      dueDate: new Date('2026-07-20T00:00:00.000Z'),
      repeatType: RepeatType.NONE,
      status: ChoreStatus.PENDING,
      completedBy: null,
      completedAt: null,
      createdBy: 5n,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
      assignee: { id: 5n, nickname: '홍길동' },
      completer: null,
      creator: { id: 5n, nickname: '홍길동' },
      ...overrides,
    };
  }
});
