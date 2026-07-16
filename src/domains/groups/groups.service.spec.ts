/// <reference types="jest" />
import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupsService } from './groups.service';

type MockedPrisma = {
  group: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  groupMember: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  $transaction: jest.MockedFunction<(fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>>;
};

function prismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mocked prisma error', { code, clientVersion: '5.22.0' });
}

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: MockedPrisma;

  beforeEach(() => {
    prisma = {
      group: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        create: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
      },
      groupMember: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        findMany: jest.fn<() => Promise<unknown>>(),
        create: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    service = new GroupsService(prisma as unknown as PrismaService);
  });

  it('creates a group with the creator as an active ADMIN member', async () => {
    prisma.group.create.mockResolvedValue({
      id: 1n,
      name: '우리집',
      description: '강남구 역삼동 셰어하우스',
      maxMembers: 4,
      createdBy: 10n,
    });

    const result = await service.createGroup({ name: '우리집', description: '강남구 역삼동 셰어하우스', maxMembers: 4 }, 10n);

    expect(result).toEqual({
      id: 1n,
      name: '우리집',
      description: '강남구 역삼동 셰어하우스',
      maxMembers: 4,
      createdBy: 10n,
    });
    const createArgs = prisma.group.create.mock.calls[0]?.[0] as {
      data: { name: string; description: string; maxMembers: number; createdBy: bigint; members: unknown };
    };

    expect(createArgs.data).toEqual(
      expect.objectContaining({
        name: '우리집',
        description: '강남구 역삼동 셰어하우스',
        maxMembers: 4,
        createdBy: 10n,
        members: { create: { userId: 10n, role: 'ADMIN' } },
      }),
    );
  });

  it('returns the group detail when the requester is an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false, name: '우리집' });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'MEMBER', leftAt: null });

    const result = await service.getGroupDetail(1n, 10n);

    expect(result).toEqual({ id: 1n, isDeleted: false, name: '우리집' });
  });

  it('throws when the group does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.getGroupDetail(999n, 10n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the requester is not a member of the group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(service.getGroupDetail(1n, 999n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('updates a group when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, name: '우리집 시즌2' });

    const result = await service.updateGroup(1n, { name: '우리집 시즌2' }, 10n);

    expect(result).toEqual({ id: 1n, name: '우리집 시즌2' });
    expect(prisma.group.update).toHaveBeenCalledWith({ where: { id: 1n }, data: { name: '우리집 시즌2' } });
  });

  it('throws when a non-ADMIN member tries to update the group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.updateGroup(1n, { name: '우리집 시즌2' }, 20n)).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a group when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, isDeleted: true });

    await service.deleteGroup(1n, 10n);

    expect(prisma.group.update).toHaveBeenCalledWith({ where: { id: 1n }, data: { isDeleted: true } });
  });

  it('throws when deleting a group that does not exist', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.deleteGroup(999n, 10n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('reissues an invite code when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, inviteCode: 'ABCDEFGH' });

    const result = await service.reissueInviteCode(1n, 10n);

    expect(result).toEqual({ id: 1n, inviteCode: 'ABCDEFGH' });
    const updateArgs = prisma.group.update.mock.calls[0]?.[0] as {
      where: { id: bigint };
      data: { inviteCode: string; inviteExpiredAt: Date };
    };

    expect(updateArgs.where).toEqual({ id: 1n });
    expect(typeof updateArgs.data.inviteCode).toBe('string');
    expect(updateArgs.data.inviteExpiredAt).toBeInstanceOf(Date);
  });

  it('retries with a new candidate when the invite code collides with an existing one', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update
      .mockRejectedValueOnce(prismaKnownError('P2002'))
      .mockResolvedValueOnce({ id: 1n, inviteCode: 'NEWCODE1' });

    const result = await service.reissueInviteCode(1n, 10n);

    expect(result).toEqual({ id: 1n, inviteCode: 'NEWCODE1' });
    expect(prisma.group.update).toHaveBeenCalledTimes(2);
  });

  it('throws when a non-ADMIN member tries to reissue the invite code', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.reissueInviteCode(1n, 20n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('joins a group with a valid invite code', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEFGH',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 1,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.groupMember.create.mockResolvedValue({ userId: 30n, groupId: 1n, role: 'MEMBER' });
    prisma.group.update.mockResolvedValue({ id: 1n, currentMembers: 2 });

    const result = await service.joinGroup({ inviteCode: 'ABCDEFGH' }, 30n);

    expect(result).toEqual({ id: 1n, currentMembers: 2 });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 1n, currentMembers: { lt: 4 } },
      data: { currentMembers: { increment: 1 } },
    });
    expect(prisma.groupMember.create).toHaveBeenCalledWith({
      data: { userId: 30n, groupId: 1n, role: 'MEMBER' },
    });
  });

  it('throws when the invite code does not match any group', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.joinGroup({ inviteCode: 'INVALID1' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the invite code has expired', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEFGH',
      inviteExpiredAt: new Date(Date.now() - 1000 * 60),
      currentMembers: 1,
      maxMembers: 4,
    });

    await expect(service.joinGroup({ inviteCode: 'ABCDEFGH' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the requester is already an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEFGH',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 2,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 30n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.joinGroup({ inviteCode: 'ABCDEFGH' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the group has reached its member limit', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEFGH',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 4,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.group.update.mockRejectedValue(prismaKnownError('P2025'));

    const error = await service.joinGroup({ inviteCode: 'ABCDEFGH' }, 30n).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessException);
    expect((error as BusinessException).code).toBe('GROUP_FULL');
    expect((error as BusinessException).getStatus()).toBe(409);
    expect(prisma.groupMember.create).not.toHaveBeenCalled();
  });

  it('does not let two concurrent joins both slip past a full group', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEFGH',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 3,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.group.update.mockResolvedValueOnce({ id: 1n, currentMembers: 4 }).mockRejectedValueOnce(prismaKnownError('P2025'));

    const results = await Promise.allSettled([
      service.joinGroup({ inviteCode: 'ABCDEFGH' }, 30n),
      service.joinGroup({ inviteCode: 'ABCDEFGH' }, 40n),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BusinessException);
  });
});
