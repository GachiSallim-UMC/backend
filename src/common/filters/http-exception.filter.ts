import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

import { ErrorCode } from '../constants/error-code.constant';
import { BusinessException } from '../exceptions/business.exception';
import { ApiErrorResponse } from '../dto/api-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.buildErrorResponse(exception);

    if (body.statusCode >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(body.statusCode).json(body);
  }

  private buildErrorResponse(exception: unknown): ApiErrorResponse {
    if (exception instanceof BusinessException) {
      return {
        statusCode: exception.getStatus(),
        data: null,
        error: {
          code: exception.code,
          message: exception.message,
          errors: exception.errors,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.message;

      return {
        statusCode: status,
        data: null,
        error: {
          code: `COMMON_${status}`,
          message: typeof message === 'string' ? message : ErrorCode.BAD_REQUEST.message,
        },
      };
    }

    return {
      statusCode: ErrorCode.INTERNAL_SERVER_ERROR.status,
      data: null,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR.code,
        message: ErrorCode.INTERNAL_SERVER_ERROR.message,
      },
    };
  }
}
