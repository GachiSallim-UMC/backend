import { jest } from '@jest/globals';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { GroupsAuthenticatedUserService } from './groups-authenticated-user.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

describe('GroupsController', () => {
  const auth: AuthContext = {
    cognitoSub: 'cognito-sub',
    accessToken: 'access-token',
  };
  const resolveActiveUserId = jest.fn<GroupsAuthenticatedUserService['resolveActiveUserId']>();
  const authenticatedUsers = { resolveActiveUserId } as unknown as GroupsAuthenticatedUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(1n);
  });

  it('resolves the authenticated user and requests the group list', async () => {
    const listGroups = jest.fn<GroupsService['listGroups']>().mockResolvedValue([] as never);
    const groupsService = { listGroups } as unknown as GroupsService;
    const controller = new GroupsController(groupsService, authenticatedUsers);

    await controller.listGroups(auth);

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(listGroups).toHaveBeenCalledWith(1n);
  });

  it('resolves the authenticated user and requests group detail', async () => {
    const getGroupDetail = jest
      .fn<GroupsService['getGroupDetail']>()
      .mockResolvedValue({} as never);
    const groupsService = { getGroupDetail } as unknown as GroupsService;
    const controller = new GroupsController(groupsService, authenticatedUsers);

    await controller.getGroupDetail(auth, '123');

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(getGroupDetail).toHaveBeenCalledWith(123n, 1n);
  });

  it('propagates a not-found error from the service', async () => {
    const getGroupDetail = jest
      .fn<GroupsService['getGroupDetail']>()
      .mockRejectedValue(new BusinessException(ErrorCode.COMMON_NOT_FOUND));
    const groupsService = { getGroupDetail } as unknown as GroupsService;
    const controller = new GroupsController(groupsService, authenticatedUsers);

    await expect(controller.getGroupDetail(auth, '999')).rejects.toMatchObject({
      code: 'COMMON_404',
    });
  });

  it('rejects an authenticated Cognito identity without an active local user', async () => {
    resolveActiveUserId.mockRejectedValue(new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND));
    const getGroupDetail = jest.fn<GroupsService['getGroupDetail']>();
    const groupsService = { getGroupDetail } as unknown as GroupsService;
    const controller = new GroupsController(groupsService, authenticatedUsers);

    await expect(controller.getGroupDetail(auth, '123')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(getGroupDetail).not.toHaveBeenCalled();
  });
});
