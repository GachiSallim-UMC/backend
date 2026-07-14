export const ErrorCode = {
  // Common
  COMMON_INTERNAL_SERVER_ERROR: {
    status: 500,
    code: 'COMMON_500',
    message: '서버 오류가 발생했습니다. 관리자에게 문의해 주세요.',
  },
  COMMON_BAD_REQUEST: {
    status: 400,
    code: 'COMMON_400',
    message: '잘못된 요청입니다.',
  },
  COMMON_INVALID_PARAMETER: {
    status: 400,
    code: 'COMMON_400_PARAM',
    message: '요청 파라미터가 잘못되었습니다.',
  },
  COMMON_UNAUTHORIZED: {
    status: 401,
    code: 'COMMON_401',
    message: '인증이 필요합니다.',
  },
  COMMON_FORBIDDEN: {
    status: 403,
    code: 'COMMON_403',
    message: '접근 권한이 없습니다.',
  },
  COMMON_NOT_FOUND: {
    status: 404,
    code: 'COMMON_404',
    message: '요청한 리소스를 찾을 수 없습니다.',
  },
  COMMON_CONFLICT: {
    status: 409,
    code: 'COMMON_409',
    message: '요청이 현재 상태와 충돌합니다.',
  },

  // User
  USER_NOT_FOUND: {
    status: 404,
    code: 'USER_404',
    message: '존재하지 않는 사용자입니다.',
  },

  // Rule
  RULE_GROUP_NOT_FOUND: {
    status: 404,
    code: 'RULE_404_GROUP',
    message: '존재하지 않는 그룹입니다.',
  },
  RULE_CATEGORY_NOT_FOUND: {
    status: 404,
    code: 'RULE_404_CATEGORY',
    message: '존재하지 않는 규칙 카테고리입니다.',
    
  }, 
  // Group
  GROUP_NOT_FOUND: {
    status: 404,
    code: 'GROUP_404',
    message: '존재하지 않는 그룹입니다.',
  },
  GROUP_MEMBER_NOT_FOUND: {
    status: 403,
    code: 'GROUP_MEMBER_403',
    message: '그룹에 속하지 않은 사용자입니다.',
  },

  // Chat
  CHAT_ROOM_NOT_FOUND: {
    status: 404,
    code: 'CHAT_ROOM_404',
    message: '존재하지 않는 채팅방입니다.',
  },
  CHAT_ROOM_MEMBER_NOT_FOUND: {
    status: 404,
    code: 'CHAT_ROOM_MEMBER_404',
    message: '채팅방에 속하지 않은 사용자입니다.',
  },
  CHAT_ROOM_MEMBER_ALREADY_JOINED: {
    status: 409,
    code: 'CHAT_ROOM_MEMBER_409',
    message: '이미 채팅방에 참여 중인 사용자입니다.',
  },
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeEntry = (typeof ErrorCode)[ErrorCodeKey];