/// <reference types="jest" />
import { jest } from '@jest/globals';

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
    update: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    updateMany: jest.MockedFunction<(args: unknown) => Promise<{ count: number }>>;
    count: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  $transaction: jest.MockedFunction<(fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>>;
};

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
        update: jest.fn<() => Promise<unknown>>(),
        updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
        count: jest.fn<() => Promise<unknown>>(),
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

  it('lists active members when the requester is an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null }]);

    const result = await service.listMembers(1n, 10n);

    expect(result).toEqual([{ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null }]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { groupId: 1n, leftAt: null },
      orderBy: { joinedAt: 'asc' },
    });
  });

  it('throws when a non-member tries to list members', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(service.listMembers(1n, 999n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('changes a member role when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });
    prisma.groupMember.update.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'ADMIN' });

    const result = await service.updateMemberRole(1n, 20n, { role: 'ADMIN' as never }, 10n);

    expect(result).toEqual({ userId: 20n, groupId: 1n, role: 'ADMIN' });
    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { userId_groupId: { userId: 20n, groupId: 1n } },
      data: { role: 'ADMIN' },
    });
  });

  it('throws when demoting the last remaining ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupMember.count.mockResolvedValue(1);

    await expect(service.updateMemberRole(1n, 10n, { role: 'MEMBER' as never }, 10n)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(prisma.groupMember.update).not.toHaveBeenCalled();
  });

  it('throws when the target member does not exist in the group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce(null);

    await expect(service.updateMemberRole(1n, 999n, { role: 'ADMIN' as never }, 10n)).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('lets a member leave the group themselves', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null })
      .mockResolvedValueOnce({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await service.removeMember(1n, 20n, 20n);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.groupMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 20n, groupId: 1n, leftAt: null } }),
    );
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentMembers: { decrement: 1 } },
    });
  });

  it('lets an ADMIN kick a different member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await service.removeMember(1n, 20n, 10n);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not double-decrement currentMembers when the member was already removed concurrently', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });
    prisma.groupMember.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.removeMember(1n, 20n, 10n);

    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('throws when a non-ADMIN tries to kick another member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.removeMember(1n, 30n, 20n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when removing the last remaining ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupMember.count.mockResolvedValue(1);

    await expect(service.removeMember(1n, 10n, 10n)).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.groupMember.updateMany).not.toHaveBeenCalled();
  });
});
