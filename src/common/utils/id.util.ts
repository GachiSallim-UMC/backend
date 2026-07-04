import { ErrorCode } from '../constants/error-code.constant';
import { BusinessException } from '../exceptions/business.exception';

export function parseBigIntId(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, [
      { field, value, reason: '숫자 형식의 식별자여야 합니다.' },
    ]);
  }

  return BigInt(value);
}
