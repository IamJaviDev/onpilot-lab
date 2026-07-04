import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Entrada de auditoría. `businessId`/`userId` los resuelve el backend (nunca el
 * frontend); en acciones de auth `businessId` puede ir null. Nunca incluir en
 * `action`/`resourceType`/`resourceId`/`metadata` contraseñas, tokens/hashes,
 * secrets ni datos clínicos.
 */
export interface AuditEntry {
  businessId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escribe una entrada de auditoría. NUNCA lanza: si la escritura falla, se
   * registra el error y la operación de negocio continúa sin verse afectada.
   * Se invoca desde el controller, después de que el service resuelve (fuera de
   * cualquier $transaction del service): el log queda siempre post-commit.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId: entry.businessId,
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      // No propagar: el fallo de auditoría no debe revertir ni bloquear la
      // acción. No se loguea `metadata` (puede contener datos de gestión).
      this.logger.error(
        `AuditLog write failed for action=${entry.action} resourceType=${entry.resourceType} resourceId=${entry.resourceId ?? 'null'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
