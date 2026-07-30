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
    code: 'COMMON_INVALID_PARAMETER',
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

  // Auth
  AUTH_UNAUTHORIZED: {
    status: 401,
    code: 'AUTH_UNAUTHORIZED',
    message: '인증이 필요합니다.',
  },
  AUTH_INVALID_CREDENTIALS: {
    status: 401,
    code: 'AUTH_INVALID_CREDENTIALS',
    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
  },
  AUTH_EMAIL_ALREADY_EXISTS: {
    status: 409,
    code: 'AUTH_EMAIL_ALREADY_EXISTS',
    message: '이미 가입된 이메일입니다.',
  },
  AUTH_EMAIL_NOT_CONFIRMED: {
    status: 409,
    code: 'AUTH_EMAIL_NOT_CONFIRMED',
    message: '이메일 확인이 필요합니다.',
  },
  AUTH_INVALID_CONFIRMATION_CODE: {
    status: 400,
    code: 'AUTH_INVALID_CONFIRMATION_CODE',
    message: '이메일 확인 코드가 올바르지 않습니다.',
  },
  AUTH_EXPIRED_CONFIRMATION_CODE: {
    status: 400,
    code: 'AUTH_EXPIRED_CONFIRMATION_CODE',
    message: '이메일 확인 코드가 만료되었습니다.',
  },
  AUTH_PASSWORD_POLICY_VIOLATION: {
    status: 400,
    code: 'AUTH_PASSWORD_POLICY_VIOLATION',
    message: '비밀번호 정책을 충족하지 않습니다.',
  },
  AUTH_CURRENT_PASSWORD_INVALID: {
    status: 400,
    code: 'AUTH_CURRENT_PASSWORD_INVALID',
    message: '현재 비밀번호가 올바르지 않습니다.',
  },
  AUTH_PASSWORD_CONFIRMATION_MISMATCH: {
    status: 400,
    code: 'AUTH_PASSWORD_CONFIRMATION_MISMATCH',
    message: '새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.',
  },
  AUTH_ACCOUNT_INACTIVE: {
    status: 403,
    code: 'AUTH_ACCOUNT_INACTIVE',
    message: '비활성화된 계정입니다.',
  },
  AUTH_ACCOUNT_NOT_FOUND: {
    status: 404,
    code: 'AUTH_ACCOUNT_NOT_FOUND',
    message: '인증 계정 정보를 찾을 수 없습니다.',
  },
  AUTH_TOO_MANY_REQUESTS: {
    status: 429,
    code: 'AUTH_TOO_MANY_REQUESTS',
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  },
  AUTH_PROVIDER_ERROR: {
    status: 502,
    code: 'AUTH_PROVIDER_ERROR',
    message: '인증 서비스 요청을 처리하지 못했습니다.',
  },
  AUTH_COMPENSATION_FAILED: {
    status: 500,
    code: 'AUTH_COMPENSATION_FAILED',
    message: '인증 정보 복구에 실패했습니다.',
  },
  AUTH_SOCIAL_ACCOUNT_LINK_REQUIRED: {
    status: 409,
    code: 'AUTH_SOCIAL_ACCOUNT_LINK_REQUIRED',
    message: '기존 계정에 소셜 로그인을 연결해야 합니다.',
  },
  AUTH_SOCIAL_EMAIL_REQUIRED: {
    status: 400,
    code: 'AUTH_SOCIAL_EMAIL_REQUIRED',
    message: '검증된 소셜 로그인 이메일이 필요합니다.',
  },
  AUTH_SOCIAL_PROVIDER_UNSUPPORTED: {
    status: 400,
    code: 'AUTH_SOCIAL_PROVIDER_UNSUPPORTED',
    message: '지원하지 않는 소셜 로그인 제공자입니다.',
  },

  // User
  USER_NOT_FOUND: {
    status: 404,
    code: 'USER_404',
    message: '존재하지 않는 사용자입니다.',
  },

  // Notification
  NOTIFICATION_FORBIDDEN: {
    status: 403,
    code: 'NOTIFICATION_FORBIDDEN',
    message: '알림을 생성할 권한이 없습니다.',
  },
  NOTIFICATION_TARGET_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_TARGET_NOT_FOUND',
    message: '알림 대상 사용자를 찾을 수 없습니다.',
  },
  NOTIFICATION_SUBSCRIPTION_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_SUBSCRIPTION_NOT_FOUND',
    message: '존재하지 않는 알림 구독입니다.',
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_NOT_FOUND',
    message: '존재하지 않는 알림입니다.',
  },

  // Chore
  CHORE_INVALID_DATE: {
    status: 400,
    code: 'CHORE_400_DATE',
    message: '마감일은 시작일보다 빠를 수 없습니다.',
  },
  CHORE_FORBIDDEN: {
    status: 403,
    code: 'CHORE_403',
    message: '집안일을 삭제할 권한이 없습니다. (등록자 또는 관리자만 가능)',
  },
  CHORE_NOT_FOUND: {
    status: 404,
    code: 'CHORE_404',
    message: '존재하지 않는 집안일입니다.',
  },
  CHORE_ALREADY_DONE: {
    status: 409,
    code: 'CHORE_409',
    message: '이미 완료된 집안일입니다.',
  },
  CHORE_NOT_DONE: {
    status: 409,
    code: 'CHORE_409_NOT_DONE',
    message: '완료되지 않은 집안일입니다.',
  },
  CHORE_NEXT_OCCURRENCE_DONE: {
    status: 409,
    code: 'CHORE_409_NEXT_DONE',
    message: '다음 회차가 이미 완료되어 완료를 취소할 수 없습니다.',
  },

  // Supply
  SUP_INVALID_CATEGORY: {
    status: 400,
    code: 'SUP_400_CATEGORY',
    message: '구매 완료 처리 시 정산 카테고리(category)는 필수입니다.',
  },
  SUP_FORBIDDEN: {
    status: 403,
    code: 'SUP_403',
    message: '공용물품을 삭제할 권한이 없습니다. (등록자 또는 관리자만 가능)',
  },
  SUP_NOT_FOUND: {
    status: 404,
    code: 'SUP_404',
    message: '존재하지 않는 공용물품입니다.',
  },
  SUP_CONFLICT: {
    status: 409,
    code: 'SUP_409',
    message: '이미 등록된 공용물품입니다. (그룹 내 동일 물품명)',
  },
  SUP_ALREADY_PURCHASED: {
    status: 409,
    code: 'SUP_ALREADY_PURCHASED',
    message: '이미 구매 완료된 공용물품입니다.',
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
    code: 'GROUP_NOT_FOUND',
    message: '존재하지 않는 그룹입니다.',
  },
  GROUP_MEMBER_NOT_FOUND: {
    status: 403,
    code: 'GROUP_MEMBER_NOT_FOUND',
    message: '그룹에 속하지 않은 사용자입니다.',
  },
  GROUP_FORBIDDEN: {
    status: 403,
    code: 'GROUP_FORBIDDEN',
    message: '그룹 관리자만 수행할 수 있는 작업입니다.',
  },
  GROUP_TARGET_MEMBER_NOT_FOUND: {
    status: 404,
    code: 'GROUP_TARGET_MEMBER_NOT_FOUND',
    message: '대상 사용자는 그룹의 구성원이 아닙니다.',
  },
  GROUP_LAST_ADMIN: {
    status: 409,
    code: 'GROUP_LAST_ADMIN',
    message: '그룹에 남은 마지막 관리자는 강등하거나 내보낼 수 없습니다.',
  },
  GROUP_INVITE_CODE_INVALID: {
    status: 404,
    code: 'GROUP_INVITE_CODE_INVALID',
    message: '유효하지 않은 초대코드입니다.',
  },
  GROUP_INVITE_CODE_EXPIRED: {
    status: 400,
    code: 'GROUP_INVITE_CODE_EXPIRED',
    message: '만료된 초대코드입니다.',
  },
  GROUP_ALREADY_MEMBER: {
    status: 409,
    code: 'GROUP_ALREADY_MEMBER',
    message: '이미 그룹에 참여 중인 사용자입니다.',
  },
  GROUP_FULL: {
    status: 409,
    code: 'GROUP_FULL',
    message: '그룹 정원이 가득 찼습니다.',
  },

  // Chat
  CHAT_ROOM_NOT_FOUND: {
    status: 404,
    code: 'CHAT_ROOM_NOT_FOUND',
    message: '존재하지 않는 채팅방입니다.',
  },
  CHAT_ROOM_MEMBER_NOT_FOUND: {
    status: 404,
    code: 'CHAT_ROOM_MEMBER_NOT_FOUND',
    message: '채팅방에 속하지 않은 사용자입니다.',
  },
  CHAT_ROOM_MEMBER_ALREADY_JOINED: {
    status: 409,
    code: 'CHAT_ROOM_MEMBER_ALREADY_JOINED',
    message: '이미 채팅방에 참여 중인 사용자입니다.',
  },
  CHAT_ROOM_OWNER_MUST_TRANSFER_BEFORE_LEAVING: {
    status: 409,
    code: 'CHAT_ROOM_OWNER_MUST_TRANSFER_BEFORE_LEAVING',
    message: '방장은 다른 멤버에게 위임한 후에만 채팅방을 나갈 수 있습니다.',
  },
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeEntry = (typeof ErrorCode)[ErrorCodeKey];
