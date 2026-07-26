import { jest } from '@jest/globals';

import { ErrorCode } from '../../common/constants/error-code.constant';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthContext } from '../auth/common/auth-context.interface';
import { ChatAuthenticatedUserService } from './chat-authenticated-user.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  const auth: AuthContext = {
    cognitoSub: 'cognito-sub',
    accessToken: 'access-token',
  };
  const resolveActiveUserId = jest.fn<ChatAuthenticatedUserService['resolveActiveUserId']>();
  const authenticatedUsers = { resolveActiveUserId } as unknown as ChatAuthenticatedUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveUserId.mockResolvedValue(1n);
  });

  it('resolves the authenticated user and creates a chat room without trusting a body-supplied creator', async () => {
    const createChatRoom = jest
      .fn<ChatService['createChatRoom']>()
      .mockResolvedValue({} as never);
    const chatService = { createChatRoom } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.createChatRoom(auth, { groupId: '1', name: '같이살림방' });

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(createChatRoom).toHaveBeenCalledWith(1n, '같이살림방', 1n, undefined);
  });

  it('resolves the authenticated user as the sender when sending a text message', async () => {
    const createTextMessage = jest
      .fn<ChatService['createTextMessage']>()
      .mockResolvedValue({} as never);
    const chatService = { createTextMessage } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.sendMessage(auth, '10', { content: '안녕하세요' });

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(createTextMessage).toHaveBeenCalledWith(10n, 1n, '안녕하세요');
  });

  it('resolves the authenticated user for markAsRead without a request body', async () => {
    const markAsRead = jest.fn<ChatService['markAsRead']>().mockResolvedValue({} as never);
    const chatService = { markAsRead } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.markAsRead(auth, '10');

    expect(resolveActiveUserId).toHaveBeenCalledWith('cognito-sub');
    expect(markAsRead).toHaveBeenCalledWith(10n, 1n);
  });

  it('passes the authenticated user id to getChatRoomDetail for membership checks', async () => {
    const getChatRoomDetail = jest
      .fn<ChatService['getChatRoomDetail']>()
      .mockResolvedValue({} as never);
    const chatService = { getChatRoomDetail } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.getChatRoomDetail(auth, '1');

    expect(getChatRoomDetail).toHaveBeenCalledWith(1n, 1n);
  });

  it('passes the authenticated user id to listChatRooms for group membership checks', async () => {
    const listChatRooms = jest.fn<ChatService['listChatRooms']>().mockResolvedValue([] as never);
    const chatService = { listChatRooms } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.listChatRooms(auth, { groupId: '10' });

    expect(listChatRooms).toHaveBeenCalledWith(10n, 1n);
  });

  it('passes the authenticated user id to deleteChatRoom for the creator check', async () => {
    const deleteChatRoom = jest
      .fn<ChatService['deleteChatRoom']>()
      .mockResolvedValue(undefined as never);
    const chatService = { deleteChatRoom } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.deleteChatRoom(auth, '1');

    expect(deleteChatRoom).toHaveBeenCalledWith(1n, 1n);
  });

  it('passes the authenticated user id to removeMember for the permission check', async () => {
    const removeMember = jest
      .fn<ChatService['removeMember']>()
      .mockResolvedValue(undefined as never);
    const chatService = { removeMember } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.removeMember(auth, '1', '2');

    expect(removeMember).toHaveBeenCalledWith(1n, 2n, 1n);
  });

  it('passes the authenticated user id to listMessages for the membership check', async () => {
    const listMessages = jest.fn<ChatService['listMessages']>().mockResolvedValue([] as never);
    const chatService = { listMessages } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.listMessages(auth, '1', {});

    expect(listMessages).toHaveBeenCalledWith(1n, 1n, undefined, undefined);
  });

  it('passes the authenticated user id to inviteMember for the membership check', async () => {
    const inviteMember = jest.fn<ChatService['inviteMember']>().mockResolvedValue([] as never);
    const chatService = { inviteMember } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await controller.inviteMember(auth, '1', { userIds: ['2', '3'] });

    expect(inviteMember).toHaveBeenCalledWith(1n, [2n, 3n], 1n);
  });

  it('rejects an authenticated Cognito identity without an active local user', async () => {
    resolveActiveUserId.mockRejectedValue(new BusinessException(ErrorCode.AUTH_ACCOUNT_NOT_FOUND));
    const getChatRoomDetail = jest.fn<ChatService['getChatRoomDetail']>();
    const chatService = { getChatRoomDetail } as unknown as ChatService;
    const controller = new ChatController(chatService, authenticatedUsers);

    await expect(controller.getChatRoomDetail(auth, '1')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_NOT_FOUND',
    });
    expect(getChatRoomDetail).not.toHaveBeenCalled();
  });
});
