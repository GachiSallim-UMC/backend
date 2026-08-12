/// <reference types="jest" />
import { jest } from '@jest/globals';
import { Prisma, ResidenceType } from '@prisma/client';

import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleStatusService } from '../rules/rule-status.service';
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
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  groupPermission: {
    upsert: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
  $transaction: jest.MockedFunction<(fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>>;
};

function prismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mocked prisma error', { code, clientVersion: '5.22.0' });
}

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: MockedPrisma;
  let runWithGroupRecalculation: jest.MockedFunction<
    (
      groupId: bigint,
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => Promise<unknown>
  >;

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
        create: jest.fn<() => Promise<unknown>>(),
      },
      groupPermission: {
        upsert: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    runWithGroupRecalculation = jest.fn(
      async (_groupId: bigint, operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(prisma as unknown as Prisma.TransactionClient),
    );
    service = new GroupsService(prisma as unknown as PrismaService, {
      runWithGroupRecalculation,
    } as unknown as RuleStatusService);
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
      data: {
        name: string;
        description: string;
        maxMembers: number;
        createdBy: bigint;
        inviteCode: string;
        members: unknown;
      };
    };

    expect(createArgs.data).toEqual(
      expect.objectContaining({
        name: '우리집',
        description: '강남구 역삼동 셰어하우스',
        maxMembers: 4,
        createdBy: 10n,
        members: { create: { userId: 10n, role: 'ADMIN' } },
        permission: { create: {} },
      }),
    );
    expect(typeof createArgs.data.inviteCode).toBe('string');
    expect(createArgs.data.inviteCode.length).toBeGreaterThan(0);
  });

  it('passes the requested residence type through to group creation', async () => {
    prisma.group.create.mockResolvedValue({ id: 1n, name: '우리집', residenceType: 'ROOMMATE', createdBy: 10n });

    await service.createGroup({ name: '우리집', maxMembers: 4, residenceType: ResidenceType.ROOMMATE }, 10n);

    const createArgs = prisma.group.create.mock.calls[0]?.[0] as { data: { residenceType?: string } };
    expect(createArgs.data.residenceType).toBe('ROOMMATE');
  });

  it('retries with a new invite code candidate when creating a group collides with an existing invite code', async () => {
    prisma.group.create
      .mockRejectedValueOnce(prismaKnownError('P2002'))
      .mockResolvedValueOnce({ id: 1n, name: '우리집', createdBy: 10n });

    const result = await service.createGroup({ name: '우리집', maxMembers: 4 }, 10n);

    expect(result).toEqual({ id: 1n, name: '우리집', createdBy: 10n });
    expect(prisma.group.create).toHaveBeenCalledTimes(2);
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

  it('updates the group image when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, groupImage: 'https://example.com/group.png' });

    const result = await service.updateGroup(1n, { groupImage: 'https://example.com/group.png' }, 10n);

    expect(result).toEqual({ id: 1n, groupImage: 'https://example.com/group.png' });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { groupImage: 'https://example.com/group.png' },
    });
  });

  it('clears the group image when groupImage is sent as null', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, groupImage: null });

    const result = await service.updateGroup(1n, { groupImage: null }, 10n);

    expect(result).toEqual({ id: 1n, groupImage: null });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { groupImage: null },
    });
  });

  it('throws when a non-ADMIN member tries to update the group', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.updateGroup(1n, { name: '우리집 시즌2' }, 20n)).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('returns the group permission for an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'MEMBER', leftAt: null });
    prisma.groupPermission.upsert.mockResolvedValue({
      groupId: 1n,
      allowChoreRegistration: true,
      allowSettlementRegistration: true,
      allowItemStatusChange: true,
      autoApproveNewMembers: false,
    });

    const result = await service.getGroupPermission(1n, 10n);

    expect(prisma.groupPermission.upsert).toHaveBeenCalledWith({
      where: { groupId: 1n },
      create: { groupId: 1n },
      update: {},
    });
    expect(result).toEqual(
      expect.objectContaining({ allowChoreRegistration: true, autoApproveNewMembers: false }),
    );
  });

  it('throws when a non-member tries to read the group permission', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(service.getGroupPermission(1n, 99n)).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.groupPermission.upsert).not.toHaveBeenCalled();
  });

  it('updates the group permission when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupPermission.upsert.mockResolvedValue({ groupId: 1n, autoApproveNewMembers: true });

    await service.updateGroupPermission(1n, { autoApproveNewMembers: true }, 10n);

    expect(prisma.groupPermission.upsert).toHaveBeenCalledWith({
      where: { groupId: 1n },
      create: { groupId: 1n, autoApproveNewMembers: true },
      update: { autoApproveNewMembers: true },
    });
  });

  it('throws when a non-ADMIN member tries to update the group permission', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(
      service.updateGroupPermission(1n, { autoApproveNewMembers: true }, 20n),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(prisma.groupPermission.upsert).not.toHaveBeenCalled();
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

  it('lists active members with the user name and profile image when the requester is an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupMember.findMany.mockResolvedValue([
      {
        userId: 10n,
        groupId: 1n,
        role: 'ADMIN',
        leftAt: null,
        user: { id: 10n, name: '김하루', nickname: '하루', profileImage: null },
      },
    ]);

    const result = await service.listMembers(1n, 10n);

    expect(result).toEqual([
      {
        userId: 10n,
        groupId: 1n,
        role: 'ADMIN',
        leftAt: null,
        user: { id: 10n, name: '김하루', nickname: '하루', profileImage: null },
      },
    ]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { groupId: 1n, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true,
        groupId: true,
        role: true,
        joinedAt: true,
        leftAt: true,
        user: {
          select: {
            id: true,
            name: true,
            nickname: true,
            profileImage: true,
          },
        },
      },
    });
  });

  it('throws when a non-member tries to list members', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(service.listMembers(1n, 999n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('delegates admin to another member and demotes the requester to MEMBER', async () => {
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
    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { userId_groupId: { userId: 10n, groupId: 1n } },
      data: { role: 'MEMBER' },
    });
  });

  it('does not demote the requester when re-affirming their own ADMIN role', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null })
      .mockResolvedValueOnce({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.groupMember.update.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN' });

    await service.updateMemberRole(1n, 10n, { role: 'ADMIN' as never }, 10n);

    expect(prisma.groupMember.update).toHaveBeenCalledTimes(1);
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

    expect(runWithGroupRecalculation).toHaveBeenCalledWith(1n, expect.any(Function));
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

    expect(runWithGroupRecalculation).toHaveBeenCalledWith(1n, expect.any(Function));
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

  it('reissues an invite code when the requester is an ADMIN', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 10n, groupId: 1n, role: 'ADMIN', leftAt: null });
    prisma.group.update.mockResolvedValue({ id: 1n, inviteCode: 'ABCDEF' });

    const result = await service.reissueInviteCode(1n, 10n);

    expect(result).toEqual({ id: 1n, inviteCode: 'ABCDEF' });
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
      .mockResolvedValueOnce({ id: 1n, inviteCode: 'NEWCOD1' });

    const result = await service.reissueInviteCode(1n, 10n);

    expect(result).toEqual({ id: 1n, inviteCode: 'NEWCOD1' });
    expect(prisma.group.update).toHaveBeenCalledTimes(2);
  });

  it('throws when a non-ADMIN member tries to reissue the invite code', async () => {
    prisma.group.findUnique.mockResolvedValue({ id: 1n, isDeleted: false });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 20n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.reissueInviteCode(1n, 20n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('returns a group preview for a valid invite code without joining', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      name: '우리집',
      description: '강남구 역삼동 셰어하우스',
      groupImage: 'https://example.com/group.png',
      residenceType: 'ROOMMATE',
      currentMembers: 2,
      maxMembers: 4,
    });

    const result = await service.getInviteInfo('ABCDEF');

    expect(result).toEqual({
      name: '우리집',
      description: '강남구 역삼동 셰어하우스',
      groupImage: 'https://example.com/group.png',
      residenceType: 'ROOMMATE',
      currentMembers: 2,
      maxMembers: 4,
    });
    expect(prisma.groupMember.findUnique).not.toHaveBeenCalled();
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('throws when previewing with an invite code that does not match any group', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.getInviteInfo('INVALI1')).rejects.toMatchObject({
      code: 'GROUP_INVITE_CODE_INVALID',
    });
  });

  it('throws when previewing with an expired invite code', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() - 1000),
    });

    await expect(service.getInviteInfo('ABCDEF')).rejects.toMatchObject({
      code: 'GROUP_INVITE_CODE_EXPIRED',
    });
  });

  it('joins a group with a valid invite code', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 1,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.groupMember.create.mockResolvedValue({ userId: 30n, groupId: 1n, role: 'MEMBER' });
    prisma.group.update.mockResolvedValue({ id: 1n, currentMembers: 2 });

    const result = await service.joinGroup({ inviteCode: 'ABCDEF' }, 30n);

    expect(result).toEqual({ id: 1n, currentMembers: 2 });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 1n, currentMembers: { lt: 4 } },
      data: { currentMembers: { increment: 1 } },
    });
    expect(prisma.groupMember.create).toHaveBeenCalledWith({
      data: { userId: 30n, groupId: 1n, role: 'MEMBER' },
    });
    expect(runWithGroupRecalculation).toHaveBeenCalledWith(1n, expect.any(Function));
  });

  it('throws when the invite code does not match any group', async () => {
    prisma.group.findUnique.mockResolvedValue(null);

    await expect(service.joinGroup({ inviteCode: 'INVALI1' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the invite code has expired', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() - 1000 * 60),
      currentMembers: 1,
      maxMembers: 4,
    });

    await expect(service.joinGroup({ inviteCode: 'ABCDEF' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the requester is already an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 2,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue({ userId: 30n, groupId: 1n, role: 'MEMBER', leftAt: null });

    await expect(service.joinGroup({ inviteCode: 'ABCDEF' }, 30n)).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when the group has reached its member limit', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 4,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.group.update.mockRejectedValue(prismaKnownError('P2025'));

    const error = await service.joinGroup({ inviteCode: 'ABCDEF' }, 30n).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessException);
    expect((error as BusinessException).code).toBe('GROUP_FULL');
    expect((error as BusinessException).getStatus()).toBe(409);
    expect(prisma.groupMember.create).not.toHaveBeenCalled();
  });

  it('does not let two concurrent joins both slip past a full group', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 1n,
      isDeleted: false,
      inviteCode: 'ABCDEF',
      inviteExpiredAt: new Date(Date.now() + 1000 * 60),
      currentMembers: 3,
      maxMembers: 4,
    });
    prisma.groupMember.findUnique.mockResolvedValue(null);
    prisma.group.update.mockResolvedValueOnce({ id: 1n, currentMembers: 4 }).mockRejectedValueOnce(prismaKnownError('P2025'));

    const results = await Promise.allSettled([
      service.joinGroup({ inviteCode: 'ABCDEF' }, 30n),
      service.joinGroup({ inviteCode: 'ABCDEF' }, 40n),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BusinessException);
  });
});
