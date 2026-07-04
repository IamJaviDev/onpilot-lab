import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Metadatos oportunistas de la petición para el AuditLog.
 * Se capturan si están disponibles; nunca son fuente de verdad de negocio.
 */
export interface AuditMeta {
  ip: string | null;
  userAgent: string | null;
}

export const AuditMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditMeta => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  },
);
