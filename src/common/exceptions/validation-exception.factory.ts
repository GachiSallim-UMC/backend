import { ValidationError } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.constant';
import { ErrorDetail } from './error-detail.interface';
import { BusinessException } from './business.exception';

function flattenValidationErrors(errors: ValidationError[], parentPath = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.children && error.children.length > 0) {
      return flattenValidationErrors(error.children, field);
    }

    const reason = Object.values(error.constraints ?? {}).join(', ');

    return [{ field, value: error.value as unknown, reason }];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): BusinessException {
  return new BusinessException(ErrorCode.COMMON_INVALID_PARAMETER, flattenValidationErrors(errors));
}
