import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUserContext } from '../auth-context.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.currentUser;
  },
);
