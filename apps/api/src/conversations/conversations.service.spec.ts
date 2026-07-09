import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';

// Qué se protege aquí:
// - Aislamiento multi-tenant: un id de otro negocio → 404 genérico (no 403, no
//   mensaje distinto), porque el findFirst filtra por businessId.
// - Sin N+1 en la lista: el último mensaje se pide con un include take:1 → la
//   lista dispara exactamente findMany + count (2 llamadas), no una por fila.
// - La metadata de los mensajes del hilo sale saneada (whitelist).
// - Orden y paginación de la lista.

const BUSINESS_A = 'b0000000-0000-0000-0000-00000000000a';
const CONV_ID = 'c0000000-0000-0000-0000-000000000001';

// Forma laxa de los args con que se llamó a Prisma, para inspeccionarlos sin
// arrastrar `any` (los mocks de jest son any por defecto).
interface PrismaCallArgs {
  where?: Record<string, unknown>;
  orderBy?: unknown;
  skip?: number;
  take?: number;
  select?: { messages?: { take?: number; orderBy?: unknown } };
}

function firstCallArgs(mock: jest.Mock): PrismaCallArgs {
  const calls = mock.mock.calls as PrismaCallArgs[][];
  return calls[0]?.[0] ?? {};
}

interface Mocks {
  service: ConversationsService;
  convFindMany: jest.Mock;
  convCount: jest.Mock;
  convFindFirst: jest.Mock;
  msgFindMany: jest.Mock;
}

function makeService(): Mocks {
  const convFindMany = jest.fn();
  const convCount = jest.fn();
  const convFindFirst = jest.fn();
  const msgFindMany = jest.fn();

  const prisma = {
    conversation: {
      findMany: convFindMany,
      count: convCount,
      findFirst: convFindFirst,
    },
    message: {
      findMany: msgFindMany,
    },
  } as unknown as PrismaService;

  return {
    service: new ConversationsService(prisma),
    convFindMany,
    convCount,
    convFindFirst,
    msgFindMany,
  };
}

describe('ConversationsService', () => {
  describe('list', () => {
    it('sin N+1: dispara exactamente findMany + count (el último mensaje va en el include)', async () => {
      const m = makeService();
      m.convFindMany.mockResolvedValue([
        {
          id: CONV_ID,
          phone: '+34600000001',
          status: 'BOT_ACTIVE',
          lastMessageAt: new Date('2026-07-08T10:00:00Z'),
          client: { id: 'cl1', name: 'Ana' },
          messages: [
            {
              body: 'Hola',
              direction: 'IN',
              author: 'CLIENT',
              createdAt: new Date('2026-07-08T10:00:00Z'),
            },
          ],
        },
      ]);
      m.convCount.mockResolvedValue(1);

      const res = await m.service.list(BUSINESS_A, {});

      // Exactamente 2 accesos a BD, ninguna query extra por fila.
      expect(m.convFindMany).toHaveBeenCalledTimes(1);
      expect(m.convCount).toHaveBeenCalledTimes(1);
      expect(m.msgFindMany).not.toHaveBeenCalled();

      // El último mensaje se pide embebido con take:1 desc.
      const args = firstCallArgs(m.convFindMany);
      expect(args.select?.messages?.take).toBe(1);
      expect(args.select?.messages?.orderBy).toEqual({ createdAt: 'desc' });

      expect(res).toEqual({
        items: [
          {
            id: CONV_ID,
            phone: '+34600000001',
            status: 'BOT_ACTIVE',
            lastMessageAt: new Date('2026-07-08T10:00:00Z'),
            client: { id: 'cl1', name: 'Ana' },
            lastMessage: {
              body: 'Hola',
              direction: 'IN',
              author: 'CLIENT',
              createdAt: new Date('2026-07-08T10:00:00Z'),
            },
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      });
    });

    it('filtra por businessId, orden lastMessageAt desc nulls last y paginación', async () => {
      const m = makeService();
      m.convFindMany.mockResolvedValue([]);
      m.convCount.mockResolvedValue(0);

      await m.service.list(BUSINESS_A, {
        page: 2,
        limit: 10,
        status: 'PENDING_REVIEW',
      });

      const args = firstCallArgs(m.convFindMany);
      expect(args.where).toEqual({
        businessId: BUSINESS_A,
        deletedAt: null,
        status: 'PENDING_REVIEW',
      });
      expect(args.orderBy).toEqual([
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ]);
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      // El count filtra por el mismo where (paginación coherente).
      expect(firstCallArgs(m.convCount).where).toEqual(args.where);
    });

    it('trunca el preview del último mensaje a 80 chars', async () => {
      const m = makeService();
      const longBody = 'a'.repeat(200);
      m.convFindMany.mockResolvedValue([
        {
          id: CONV_ID,
          phone: '+34600000001',
          status: 'BOT_ACTIVE',
          lastMessageAt: new Date(),
          client: null,
          messages: [
            {
              body: longBody,
              direction: 'OUT',
              author: 'BOT',
              createdAt: new Date(),
            },
          ],
        },
      ]);
      m.convCount.mockResolvedValue(1);

      const res = await m.service.list(BUSINESS_A, {});
      const preview = res.items[0].lastMessage?.body ?? '';
      expect(preview.endsWith('…')).toBe(true);
      expect(preview.length).toBeLessThanOrEqual(81); // 80 + elipsis
    });

    it('conversación sin mensajes → lastMessage null', async () => {
      const m = makeService();
      m.convFindMany.mockResolvedValue([
        {
          id: CONV_ID,
          phone: '+34600000001',
          status: 'CLOSED',
          lastMessageAt: null,
          client: null,
          messages: [],
        },
      ]);
      m.convCount.mockResolvedValue(1);

      const res = await m.service.list(BUSINESS_A, {});
      expect(res.items[0].lastMessage).toBeNull();
    });
  });

  describe('getThread', () => {
    it('id de otro negocio (o borrado) → 404 genérico', async () => {
      const m = makeService();
      // El findFirst filtrado por businessId no encuentra la conversación ajena.
      m.convFindFirst.mockResolvedValue(null);

      await expect(m.service.getThread(BUSINESS_A, CONV_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(m.service.getThread(BUSINESS_A, CONV_ID)).rejects.toThrow(
        'Conversation not found',
      );
      // El gate filtra por id + businessId + deletedAt (no findUnique).
      expect(firstCallArgs(m.convFindFirst).where).toEqual({
        id: CONV_ID,
        businessId: BUSINESS_A,
        deletedAt: null,
      });
      // No se llegó a leer mensajes.
      expect(m.msgFindMany).not.toHaveBeenCalled();
    });

    it('devuelve cabecera + mensajes en asc, con metadata saneada', async () => {
      const m = makeService();
      m.convFindFirst.mockResolvedValue({
        id: CONV_ID,
        phone: '+34600000001',
        status: 'PENDING_REVIEW',
        client: { id: 'cl1', name: 'Ana' },
      });
      // La BD devuelve desc (los más recientes primero); el service los invierte.
      m.msgFindMany.mockResolvedValue([
        {
          id: 'msg2',
          direction: 'OUT',
          author: 'BOT',
          body: 'Te paso con una persona',
          createdAt: new Date('2026-07-08T10:05:00Z'),
          metadata: {
            inputTokens: 100,
            outputTokens: 50,
            model: 'claude-haiku-4-5',
            toolCalls: [{ name: 'escalar_a_humano', ok: true }],
            phantomGuard: 'corrected',
            escalation: { motivo: 'PIDE_HUMANO' },
          },
        },
        {
          id: 'msg1',
          direction: 'IN',
          author: 'CLIENT',
          body: 'Quiero hablar con alguien',
          createdAt: new Date('2026-07-08T10:00:00Z'),
          metadata: null,
        },
      ]);

      const res = await m.service.getThread(BUSINESS_A, CONV_ID);

      expect(res.id).toBe(CONV_ID);
      expect(res.phone).toBe('+34600000001');
      expect(res.status).toBe('PENDING_REVIEW');
      expect(res.client).toEqual({ id: 'cl1', name: 'Ana' });

      // Orden ascendente (msg1 antes que msg2).
      expect(res.messages.map((x) => x.id)).toEqual(['msg1', 'msg2']);

      // Mensaje del cliente sin metadata.
      expect(res.messages[0].metadata).toBeNull();

      // El OUT del bot: metadata saneada a solo escalation.motivo.
      expect(res.messages[1].metadata).toEqual({
        escalation: { motivo: 'PIDE_HUMANO' },
      });
      // Ausencia de lo interno end-to-end.
      const leaked = res.messages[1].metadata as Record<string, unknown>;
      expect(leaked).not.toHaveProperty('inputTokens');
      expect(leaked).not.toHaveProperty('outputTokens');
      expect(leaked).not.toHaveProperty('model');
      expect(leaked).not.toHaveProperty('toolCalls');
      expect(leaked).not.toHaveProperty('phantomGuard');

      // El hilo filtra por conversationId + businessId + deletedAt, take 100 desc.
      const args = firstCallArgs(m.msgFindMany);
      expect(args.where).toEqual({
        conversationId: CONV_ID,
        businessId: BUSINESS_A,
        deletedAt: null,
      });
      expect(args.take).toBe(100);
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});
