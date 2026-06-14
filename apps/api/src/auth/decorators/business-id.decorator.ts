import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Devuelve el businessId del negocio activo resuelto por JwtAuthGuard.
 * Si el usuario autenticado no tiene negocio activo (p. ej. ONPILOT_ADMIN
 * sin membresía), lanza 403: los recursos de negocio exigen contexto de negocio.
 */
export const BusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const businessId = request.currentBusiness?.id;
    if (!businessId) {
      throw new ForbiddenException('No active business');
    }
    return businessId;
  },
);
