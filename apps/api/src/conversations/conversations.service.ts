import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ConversationStatus,
  MessageAuthor,
  MessageDirection,
  Prisma,
} from '../generated/prisma/client';
import { ConversationService } from '../messaging/conversation.service';
import {
  WhatsAppAdapter,
  WhatsAppSendError,
} from '../messaging/whatsapp.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import {
  PublicMessageMetadata,
  sanitizeMessageMetadata,
} from './message-metadata.util';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// Longitud del preview del último mensaje en la lista (SPEC: ~80 chars).
const PREVIEW_MAX = 80;

// Tope de mensajes del hilo en v1. Los ~100 más recientes en orden ascendente
// (cursor para hilos largos = deuda menor). Con conversaciones de MVP sobra.
const THREAD_LIMIT = 100;

// Cliente vinculado embebido en lista y cabecera del hilo.
const CLIENT_SELECT = { id: true, name: true } satisfies Prisma.ClientSelect;

interface ConversationRow {
  id: string;
  phone: string;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  client: { id: string; name: string } | null;
  messages: {
    body: string;
    direction: MessageDirection;
    author: MessageAuthor;
    createdAt: Date;
  }[];
}

interface ThreadMessageRow {
  id: string;
  direction: MessageDirection;
  author: MessageAuthor;
  body: string;
  createdAt: Date;
  metadata: Prisma.JsonValue | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    // Reutilizados de MessagingModule (T9): el envío manual usa el mismo
    // adapter de Meta y la misma persistencia OUT que el bot.
    private readonly adapter: WhatsAppAdapter,
    private readonly outgoing: ConversationService,
  ) {}

  /**
   * Lista paginada de conversaciones del negocio. Orden: lastMessageAt DESC
   * (nulls last → las activas arriba, las CLOSED al final por su fecha).
   *
   * Sin N+1: el último mensaje de cada fila se trae con un `include` de la
   * relación `messages` limitado a `take: 1`. Prisma lo resuelve con UNA query
   * adicional (WHERE conversationId IN (...) particionado por padre), no una
   * por fila → total 3 queries: findMany + last-messages + count.
   */
  async list(businessId: string, query: ListConversationsQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ConversationWhereInput = {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          status: true,
          lastMessageAt: true,
          client: { select: CLIENT_SELECT },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              body: true,
              direction: true,
              author: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toListItem(row)),
      page,
      limit,
      total,
    };
  }

  /**
   * Hilo completo de una conversación. Gate multi-tenant PRIMERO: un id de otro
   * negocio (o borrado) cae en el findFirst filtrado → 404 genérico, sin
   * revelar que existe en otro negocio (patrón de H1).
   */
  async getThread(businessId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, businessId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        status: true,
        client: { select: CLIENT_SELECT },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Los últimos THREAD_LIMIT (desc) y luego se invierten a ascendente para
    // pintar el hilo cronológicamente.
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: THREAD_LIMIT,
      select: {
        id: true,
        direction: true,
        author: true,
        body: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      ...conversation,
      messages: rows.reverse().map((row) => this.toThreadMessage(row)),
    };
  }

  // --- Escrituras (T9): tomar control / devolver al bot / responder a mano ---
  //
  // El campo `status` tiene DOS escritores independientes que no se coordinan:
  // el bot (escalar_a_humano → PENDING_REVIEW, en messaging) y el panel (estas
  // transiciones). Cada uno gestiona su camino; aquí solo mandan las acciones
  // explícitas del profesional.

  /**
   * Toma el control (→ HUMAN_CONTROL). Origen válido: BOT_ACTIVE o
   * PENDING_REVIEW (veo que el bot escaló → cojo yo). Ya en HUMAN_CONTROL →
   * idempotente (sin cambio). Desde CLOSED → 409.
   */
  async takeControl(businessId: string, id: string) {
    return this.transition(businessId, id, {
      target: ConversationStatus.HUMAN_CONTROL,
      validOrigins: [
        ConversationStatus.BOT_ACTIVE,
        ConversationStatus.PENDING_REVIEW,
      ],
    });
  }

  /**
   * Devuelve al bot (→ BOT_ACTIVE). Origen válido: HUMAN_CONTROL o
   * PENDING_REVIEW. Ya en BOT_ACTIVE → idempotente. Desde CLOSED → 409.
   */
  async release(businessId: string, id: string) {
    return this.transition(businessId, id, {
      target: ConversationStatus.BOT_ACTIVE,
      validOrigins: [
        ConversationStatus.HUMAN_CONTROL,
        ConversationStatus.PENDING_REVIEW,
      ],
    });
  }

  /**
   * Transición de estado con gate multi-tenant. Devuelve `changed:false` si ya
   * estaba en el destino (idempotente, el controller no audita). CLOSED nunca
   * transiciona por el panel (una conversación cerrada no se reabre así).
   */
  private async transition(
    businessId: string,
    id: string,
    opts: { target: ConversationStatus; validOrigins: ConversationStatus[] },
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, businessId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.status === opts.target) {
      return { id, status: opts.target, changed: false };
    }
    if (!opts.validOrigins.includes(conversation.status)) {
      throw new ConflictException(
        `No se puede cambiar el estado desde ${conversation.status}.`,
      );
    }

    await this.prisma.conversation.updateMany({
      where: { id, businessId, deletedAt: null },
      data: { status: opts.target },
    });
    return { id, status: opts.target, changed: true };
  }

  /**
   * Respuesta manual del profesional. Precondición dura: la conversación debe
   * estar en HUMAN_CONTROL (si no, el bot y el humano se pisarían) → 409.
   *
   * Orden ENVIAR → PERSISTIR (el reverso del bug de confirmaciones fantasma):
   * si Meta rechaza, NO queda un Message fantasma que el cliente nunca recibió.
   * Ventana de 24h (131047) → 422 explícito; otros fallos de envío → 502.
   */
  async sendManualMessage(businessId: string, id: string, body: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, businessId, deletedAt: null },
      select: { id: true, phone: true, status: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.status !== ConversationStatus.HUMAN_CONTROL) {
      throw new ConflictException(
        'Toma el control de la conversación antes de escribir.',
      );
    }

    let waMessageId: string;
    try {
      const sent = await this.adapter.sendText(conversation.phone, body);
      waMessageId = sent.waMessageId;
    } catch (error) {
      if (error instanceof WhatsAppSendError) {
        // Dos rechazos de política distintos → ambos 422 (la petición se
        // entiende, WhatsApp la impide), con mensajes propios y accionables.
        if (error.isReengagementWindowClosed) {
          throw new UnprocessableEntityException(
            'No se puede escribir: han pasado más de 24 h desde el último ' +
              'mensaje del cliente. WhatsApp solo permite plantillas fuera de ' +
              'esa ventana.',
          );
        }
        if (error.isRecipientNotAllowed) {
          throw new UnprocessableEntityException(
            'Este número no está en la lista de destinatarios permitidos del ' +
              'sandbox de WhatsApp. Añádelo en el panel de Meta (hasta 5 ' +
              'números de prueba).',
          );
        }
      }
      // El adapter ya logueó el detalle. Mensaje honesto: reintentar no arregla
      // un rechazo de Meta; que el profesional revise el número.
      throw new BadGatewayException(
        'WhatsApp rechazó el envío. Comprueba que el número es correcto y ' +
          'tiene WhatsApp activo.',
      );
    }

    // Solo tras confirmar que Meta lo aceptó: persistir OUT/HUMAN + lastMessageAt.
    await this.outgoing.persistOutgoing({
      businessId,
      conversationId: id,
      body,
      waMessageId,
      author: MessageAuthor.HUMAN,
    });

    return { ok: true };
  }

  private toListItem(row: ConversationRow) {
    const last = row.messages[0];
    return {
      id: row.id,
      phone: row.phone,
      status: row.status,
      lastMessageAt: row.lastMessageAt,
      client: row.client,
      lastMessage: last
        ? {
            body: truncate(last.body, PREVIEW_MAX),
            direction: last.direction,
            author: last.author,
            createdAt: last.createdAt,
          }
        : null,
    };
  }

  private toThreadMessage(row: ThreadMessageRow) {
    const metadata: PublicMessageMetadata | null = sanitizeMessageMetadata(
      row.metadata,
    );
    return {
      id: row.id,
      direction: row.direction,
      author: row.author,
      body: row.body,
      createdAt: row.createdAt,
      metadata,
    };
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
