import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentBusinessContext } from '../auth-context.types';

export const CurrentBusiness = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): CurrentBusinessContext | null | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.currentBusiness;
  },
);
