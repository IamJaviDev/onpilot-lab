import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationStatus,
  MessageAuthor,
  MessageDirection,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IncomingTextMessage {
  businessId: string;
  // Teléfono del remitente, ya normalizado a E.164.
  phone: string;
  body: string;
  waMessageId: string;
  timestamp: Date;
}

/**
 * Resultado de persistir un entrante. El caso `persisted: true` expone la
 * conversación (id + status) para que el llamante pueda decidir la respuesta
 * automática sin una query extra fuera de la transacción.
 */
export type PersistIncomingResult =
  | {
      persisted: true;
      conversationId: string;
      conversationStatus: ConversationStatus;
    }
  | { persisted: false };

export interface OutgoingBotMessage {
  businessId: string;
  conversationId: string;
  body: string;
  // wamid devuelto por Meta al enviar.
  waMessageId: string;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persiste un mensaje entrante: localiza (o crea) la conversación abierta del
   * remitente y le añade el Message IN. Todo en una transacción.
   *
   * Idempotencia: el índice único parcial (businessId, waMessageId) de la Tarea 1
   * es la red de seguridad ante los reintentos de Meta. Un P2002 se trata como
   * duplicado esperado (no error) → la transacción revierte por completo, sin
   * dejar conversación ni mensaje fantasma.
   *
   * @returns la conversación afectada si persistió; `persisted: false` si era
   *   un duplicado ya visto.
   */
  async persistIncoming(
    msg: IncomingTextMessage,
  ): Promise<PersistIncomingResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Vinculación best-effort con un Client existente por teléfono.
        // Si el formato no casa (H1 local vs E.164), clientId queda null.
        const client = await tx.client.findFirst({
          where: {
            businessId: msg.businessId,
            phone: msg.phone,
            deletedAt: null,
          },
          select: { id: true },
        });

        const existing = await tx.conversation.findFirst({
          where: {
            businessId: msg.businessId,
            phone: msg.phone,
            status: { not: ConversationStatus.CLOSED },
            deletedAt: null,
          },
          select: { id: true, status: true },
        });

        const conversation =
          existing ??
          (await tx.conversation.create({
            data: {
              businessId: msg.businessId,
              clientId: client?.id ?? null,
              phone: msg.phone,
              status: ConversationStatus.BOT_ACTIVE,
            },
            select: { id: true, status: true },
          }));

        await tx.message.create({
          data: {
            businessId: msg.businessId,
            conversationId: conversation.id,
            direction: MessageDirection.IN,
            author: MessageAuthor.CLIENT,
            body: msg.body,
            waMessageId: msg.waMessageId,
          },
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: msg.timestamp },
        });

        return {
          persisted: true as const,
          conversationId: conversation.id,
          conversationStatus: conversation.status,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.log(
          `duplicate webhook, ignored (waMessageId=${msg.waMessageId})`,
        );
        return { persisted: false };
      }
      throw error;
    }
  }

  /**
   * Persiste un mensaje saliente ya enviado por el bot: Message OUT/BOT con el
   * wamid que devolvió Meta, y actualización de lastMessageAt. El CHECK de
   * coherencia dirección/autor de la Tarea 1 lo protege además en BD.
   *
   * `author: BOT` fijo a propósito: las respuestas de humanos (HUMAN) llegan
   * con la bandeja de la Tarea 6.
   */
  async persistOutgoing(msg: OutgoingBotMessage): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          businessId: msg.businessId,
          conversationId: msg.conversationId,
          direction: MessageDirection.OUT,
          author: MessageAuthor.BOT,
          body: msg.body,
          waMessageId: msg.waMessageId,
        },
      }),
      // updateMany con id + businessId: regla multi-tenant del proyecto.
      this.prisma.conversation.updateMany({
        where: { id: msg.conversationId, businessId: msg.businessId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  }
}
