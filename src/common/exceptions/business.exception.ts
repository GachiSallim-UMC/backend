import { HttpException } from '@nestjs/common';

import { ErrorCodeEntry } from '../constants/error-code.constant';
import { ErrorDetail } from './error-detail.interface';

export class BusinessException extends HttpException {
  readonly code: string;
  readonly errors?: ErrorDetail[];

  constructor(errorCode: ErrorCodeEntry, errors?: ErrorDetail[]) {
    super(errorCode.message, errorCode.status);
    this.code = errorCode.code;
    this.errors = errors;
  }
}
