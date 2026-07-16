import { Test, TestingModule } from '@nestjs/testing';
import { ChoreStatus, RepeatType } from '@prisma/client';
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
  };

  beforeEach(async () => {
    prisma = {
      chore: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
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
});
