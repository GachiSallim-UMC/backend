import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ApiSuccessResponseDto } from '../dto/api-success-response.dto';

interface ApiWrappedSuccessResponseOptions {
  status: number;
  description: string;
  type: Type<unknown>;
}

export const ApiWrappedSuccessResponse = ({
  status,
  description,
  type,
}: ApiWrappedSuccessResponseOptions): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessResponseDto, type),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiSuccessResponseDto) },
          {
            type: 'object',
            required: ['data'],
            properties: { data: { $ref: getSchemaPath(type) } },
          },
        ],
      },
    }),
  );
