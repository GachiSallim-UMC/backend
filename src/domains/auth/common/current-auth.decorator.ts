import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthContext } from './auth-context.interface';
import { AuthenticatedRequest } from './authenticated-request.interface';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  },
);
