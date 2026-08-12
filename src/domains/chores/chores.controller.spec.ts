import { jest } from '@jest/globals';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { ChoresAuthenticatedUserService } from './chores-authenticated-user.service';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';

describe('ChoresController', () => {
  const auth: AuthContext = {
    cognitoSub: 'cognito-sub',
    accessToken: 'access-token',
  };
  const resolveActiveUserId = jest.fn<ChoresAuthenticatedUserService['resolveActiveUserId']>();
  const authenticatedUsers = {
    resolveActiveUserId,
  } as unknown as ChoresAuthenticatedUserService;

  function createController(choresService: Partial<ChoresService>) {
    return new ChoresController(choresService as ChoresService, authenticatedUsers);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(1n);
  });

  it('잘못된 형식의 choreId면 400 예외를 던진다', async () => {
    const controller = createController({ completeChore: jest.fn() as never });

    await expect(controller.completeChore(auth, '12-3')).rejects.toMatchObject({
      code: 'COMMON_INVALID_PARAMETER',
    });
  });

  it('토큰에서 사용자를 해석해 완료 처리를 위임한다', async () => {
    const completeChore = jest.fn<ChoresService['completeChore']>().mockResolvedValue({} as never);
    const controller = createController({ completeChore });

    await controller.completeChore(auth, '11');

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(completeChore).toHaveBeenCalledWith(11n, 1n);
  });

  it('토큰에서 사용자를 해석해 완료 취소를 위임한다', async () => {
    const incompleteChore = jest
      .fn<ChoresService['incompleteChore']>()
      .mockResolvedValue({} as never);
    const controller = createController({ incompleteChore });

    await controller.incompleteChore(auth, '11');

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(incompleteChore).toHaveBeenCalledWith(11n, 1n);
  });

  it('목록 조회 시 요청자 ID를 함께 전달한다', async () => {
    const listChores = jest.fn<ChoresService['listChores']>().mockResolvedValue([] as never);
    const controller = createController({ listChores });

    await controller.listChores(auth, { groupId: 1 });

    expect(listChores).toHaveBeenCalledWith({ groupId: 1 }, 1n);
  });

  it('등록 시 토큰에서 해석한 사용자를 createdBy로 전달한다', async () => {
    const createChore = jest.fn<ChoresService['createChore']>().mockResolvedValue({} as never);
    const controller = createController({ createChore });
    const dto = { groupId: 1, title: '설거지' } as never;

    await controller.createChore(auth, dto);

    expect(createChore).toHaveBeenCalledWith(dto, 1n);
  });

  it('수정 시 요청자 ID를 함께 전달한다', async () => {
    const updateChore = jest.fn<ChoresService['updateChore']>().mockResolvedValue({} as never);
    const controller = createController({ updateChore });
    const dto = { title: '설거지' } as never;

    await controller.updateChore(auth, '11', dto);

    expect(updateChore).toHaveBeenCalledWith(11n, dto, 1n);
  });

  it('삭제 시 요청자 ID를 함께 전달한다', async () => {
    const deleteChore = jest.fn<ChoresService['deleteChore']>().mockResolvedValue({} as never);
    const controller = createController({ deleteChore });

    await controller.deleteChore(auth, '11');

    expect(deleteChore).toHaveBeenCalledWith(11n, 1n);
  });

  it('공유 시 토큰에서 해석한 사용자를 발신자로 전달한다', async () => {
    const shareChore = jest.fn<ChoresService['shareChore']>().mockResolvedValue({} as never);
    const controller = createController({ shareChore });

    await controller.shareChore(auth, '11', { chatRoomId: 3, content: '확인해주세요' });

    expect(shareChore).toHaveBeenCalledWith(11n, 1n, 3n, '확인해주세요');
  });

  it('로컬 사용자가 없는 Cognito 계정이면 예외를 그대로 전달한다', async () => {
    resolveActiveUserId.mockRejectedValue(new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND));
    const completeChore = jest.fn<ChoresService['completeChore']>();
    const controller = createController({ completeChore });

    await expect(controller.completeChore(auth, '11')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(completeChore).not.toHaveBeenCalled();
  });

  it('그룹 멤버가 아니면 서비스의 403을 그대로 전달한다', async () => {
    const completeChore = jest
      .fn<ChoresService['completeChore']>()
      .mockRejectedValue(new BusinessException(ErrorCode.GROUP_MEMBER_NOT_FOUND));
    const controller = createController({ completeChore });

    await expect(controller.completeChore(auth, '11')).rejects.toMatchObject({
      code: 'GROUP_MEMBER_NOT_FOUND',
    });
  });
});
