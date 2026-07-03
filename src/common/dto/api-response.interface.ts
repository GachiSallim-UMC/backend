import { ErrorDetail } from '../exceptions/error-detail.interface';

export interface ApiSuccessResponse<T> {
  statusCode: number;
  data: T;
  error: null;
}

export interface ApiErrorResponse {
  statusCode: number;
  data: null;
  error: {
    code: string;
    message: string;
    errors?: ErrorDetail[];
  };
}
