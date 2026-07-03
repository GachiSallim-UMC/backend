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

      return {
        statusCode: status,
        data: null,
        error: {
          code: `COMMON_${status}`,
          message: this.extractMessage(exception),
        },
      };
    }

    return {
      statusCode: ErrorCode.COMMON_INTERNAL_SERVER_ERROR.status,
      data: null,
      error: {
        code: ErrorCode.COMMON_INTERNAL_SERVER_ERROR.code,
        message: ErrorCode.COMMON_INTERNAL_SERVER_ERROR.message,
      },
    };
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const { message } = response as { message: string | string[] };

      return Array.isArray(message) ? message.join(', ') : message;
    }

    return exception.message;
  }
}
