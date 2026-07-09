import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConversationStatus,
  MessageAuthor,
  MessageDirection,
  Prisma,
} from '../generated/prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
