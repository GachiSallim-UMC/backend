import { jest } from '@jest/globals';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

describe('RulesController', () => {
  it('throws COMMON_UNAUTHORIZED when x-user-id is missing on getRule', () => {
    const rulesService = { getRule: jest.fn() } as unknown as RulesService;
    const controller = new RulesController(rulesService);

    expect(() => controller.getRule(undefined as unknown as string, '1')).toThrow(
      new BusinessException(ErrorCode.COMMON_UNAUTHORIZED),
    );
  });

  it('throws COMMON_BAD_REQUEST when user id is malformed on getRule', () => {
    const rulesService = { getRule: jest.fn() } as unknown as RulesService;
    const controller = new RulesController(rulesService);

    expect(() => controller.getRule('abc', '1')).toThrow(
      new BusinessException(ErrorCode.COMMON_BAD_REQUEST),
    );
  });

  it('throws COMMON_BAD_REQUEST when ruleId is malformed on getRule', () => {
    const rulesService = { getRule: jest.fn() } as unknown as RulesService;
    const controller = new RulesController(rulesService);

    expect(() => controller.getRule('1', '12-3')).toThrow(
      new BusinessException(ErrorCode.COMMON_BAD_REQUEST),
    );
  });

  it('forwards GROUP_MEMBER_NOT_FOUND from service on getRule', async () => {
    const getRule = jest
      .fn<RulesService['getRule']>()
      .mockRejectedValue(new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND));
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService);

    await expect(controller.getRule('1', '123')).rejects.toMatchObject({
      code: 'GROUP_MEMBER_NOT_FOUND',
    });
    expect(getRule).toHaveBeenCalledWith(123n, 1n);
  });

  it('forwards COMMON_NOT_FOUND from service on getRule', async () => {
    const getRule = jest
      .fn<RulesService['getRule']>()
      .mockRejectedValue(new BusinessException(ErrorCode.COMMON_NOT_FOUND));
    const rulesService = { getRule } as unknown as RulesService;
    const controller = new RulesController(rulesService);

    await expect(controller.getRule('1', '999')).rejects.toMatchObject({
      code: 'COMMON_404',
    });
    expect(getRule).toHaveBeenCalledWith(999n, 1n);
  });
});
