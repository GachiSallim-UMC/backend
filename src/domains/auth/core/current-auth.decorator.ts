import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthContext, AuthenticatedRequest, AuthenticatedUser } from './auth-context.interface';

const getAuthContext = (context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

  if (!request.authContext) {
    throw new Error('Auth context is not available. Apply AlbAuthGuard first.');
  }

  return request.authContext;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => getAuthContext(context).user,
);

export const CurrentAccessToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => getAuthContext(context).accessToken,
);
