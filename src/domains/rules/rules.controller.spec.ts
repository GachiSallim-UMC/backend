import { jest } from '@jest/globals';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { RulesAuthenticatedUserService } from './rules-authenticated-user.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

describe('RulesController', () => {
  const auth: AuthContext = {
    cognitoSub: 'cognito-sub',
    accessToken: 'access-token',
  };
  const resolveActiveUserId = jest.fn<RulesAuthenticatedUserService['resolveActiveUserId']>();
  const authenticatedUsers = { resolveActiveUserId } as unknown as RulesAuthenticatedUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(1n);
  });

  it('rejects a malformed ruleId', async () => {
    const rulesService = { getRule: jest.fn() } as unknown as RulesService;
    const controller = new RulesController(rulesService, authenticatedUsers);

    await expect(controller.getRule(auth, '12-3')).rejects.toMatchObject({
      code: 'COMMON_400',
    });
  });

  it('resolves the authenticated user and requests rule detail', async () => {
    const getRule = jest.fn<RulesService['getRule']>().mockResolvedValue({} as never);
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService, authenticatedUsers);

    await controller.getRule(auth, '123');

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(getRule).toHaveBeenCalledWith(123n, 1n);
  });

  it('forwards GROUP_MEMBER_NOT_FOUND from service on getRule', async () => {
    const getRule = jest
      .fn<RulesService['getRule']>()
      .mockRejectedValue(new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND));
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService, authenticatedUsers);

    await expect(controller.getRule(auth, '123')).rejects.toMatchObject({
      code: 'GROUP_MEMBER_NOT_FOUND',
    });
    expect(getRule).toHaveBeenCalledWith(123n, 1n);
  });

  it('forwards COMMON_NOT_FOUND from service on getRule', async () => {
    const getRule = jest
      .fn<RulesService['getRule']>()
      .mockRejectedValue(new BusinessException(ErrorCode.COMMON_NOT_FOUND));
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService, authenticatedUsers);

    await expect(controller.getRule(auth, '999')).rejects.toMatchObject({
      code: 'COMMON_404',
    });
    expect(getRule).toHaveBeenCalledWith(999n, 1n);
  });

  it('rejects an authenticated Cognito identity without an active local user', async () => {
    resolveActiveUserId.mockRejectedValue(new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND));
    const getRule = jest.fn<RulesService['getRule']>();
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService, authenticatedUsers);

    await expect(controller.getRule(auth, '123')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(getRule).not.toHaveBeenCalled();
  });
});
