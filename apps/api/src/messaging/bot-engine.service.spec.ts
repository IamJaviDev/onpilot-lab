import type { ConfigService } from '@nestjs/config';
import { MessageDirection } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BotEngineService, mapHistoryToTurns } from './bot-engine.service';

// Tests del BotEngine v0 (Tarea 4) con Anthropic (fetch) y Prisma mockeados.
// Lo que se protege: las queries van SIEMPRE filtradas por businessId (el
// prompt jamás puede contener datos de otro negocio), el historial se mapea a
// turnos user/assistant válidos, la metadata de tokens sale del usage real, y
// cualquier fallo de Claude devuelve null sin lanzar.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';

interface PrismaMocks {
  businessFindFirst: jest.Mock;
  serviceFindMany: jest.Mock;
  messageFindFirst: jest.Mock;
  messageFindMany: jest.Mock;
}

function makeService(): { service: BotEngineService; mocks: PrismaMocks } {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key';
      throw new Error(`missing env ${key}`);
    },
  } as unknown as ConfigService;

  const mocks: PrismaMocks = {
    businessFindFirst: jest.fn().mockResolvedValue({
      name: 'Fruteria Javier',
      timezone: 'Europe/Madrid',
    }),
    serviceFindMany: jest.fn().mockResolvedValue([
      // basePrice como number: expone el mismo .toFixed que Prisma.Decimal.
      { name: 'Cesta de fruta', basePrice: 25, durationMinutes: 30 },
    ]),
    // Sin OUT previo del BOT por defecto → primera respuesta.
    messageFindFirst: jest.fn().mockResolvedValue(null),
    messageFindMany: jest.fn().mockResolvedValue([
      // Orden createdAt desc, como la query real.
      { direction: MessageDirection.IN, body: 'Hola, ¿qué servicios tenéis?' },
    ]),
  };

  const prisma = {
    business: { findFirst: mocks.businessFindFirst },
    service: { findMany: mocks.serviceFindMany },
    message: {
      findFirst: mocks.messageFindFirst,
      findMany: mocks.messageFindMany,
    },
  } as unknown as PrismaService;

  return { service: new BotEngineService(config, prisma), mocks };
}

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}

function claudePayload(text = 'Tenemos cesta de fruta a 25.00 €.') {
  return {
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 812, output_tokens: 96 },
  };
}

describe('BotEngineService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse(claudePayload()));
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('éxito: llama a /v1/messages con el modelo constante y devuelve texto + metadata de tokens', async () => {
    const { service } = makeService();

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply).toEqual({
      body: 'Tenemos cesta de fruta a 25.00 €.',
      metadata: {
        inputTokens: 812,
        outputTokens: 96,
        model: 'claude-haiku-4-5',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'sk-ant-test-key',
    );
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe(
      '2023-06-01',
    );

    const body = JSON.parse(init.body as string) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(500);
    // El system prompt lleva los datos reales del negocio resuelto.
    expect(body.system).toContain('Fruteria Javier');
    expect(body.system).toContain('- Cesta de fruta — 25.00 € — 30 min');
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hola, ¿qué servicios tenéis?' },
    ]);
  });

  it('multi-tenancy: TODAS las queries van filtradas por businessId', async () => {
    const { service, mocks } = makeService();

    await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    // Se inspeccionan los args reales de cada query en vez de objectContaining
    // (evita `any` de los matchers anidados y falla igual de claro).
    type WhereArgs = {
      where: { id?: string; businessId?: string; conversationId?: string };
    };
    const businessWhere = (
      mocks.businessFindFirst.mock.calls[0] as [WhereArgs]
    )[0].where;
    expect(businessWhere.id).toBe(BUSINESS_ID);

    const serviceWhere = (mocks.serviceFindMany.mock.calls[0] as [WhereArgs])[0]
      .where;
    expect(serviceWhere.businessId).toBe(BUSINESS_ID);

    const findFirstWhere = (
      mocks.messageFindFirst.mock.calls[0] as [WhereArgs]
    )[0].where;
    expect(findFirstWhere.businessId).toBe(BUSINESS_ID);
    expect(findFirstWhere.conversationId).toBe(CONVERSATION_ID);

    const findManyWhere = (
      mocks.messageFindMany.mock.calls[0] as [WhereArgs]
    )[0].where;
    expect(findManyWhere.businessId).toBe(BUSINESS_ID);
    expect(findManyWhere.conversationId).toBe(CONVERSATION_ID);
  });

  it('identificación IA: sin OUT previo del BOT el system prompt pide identificarse; con OUT previo, no', async () => {
    const { service, mocks } = makeService();

    await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    let body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { system: string };
    expect(body.system).toContain('Primer mensaje (obligatorio)');

    mocks.messageFindFirst.mockResolvedValue({ id: 'previous-out' });
    await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    body = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as { system: string };
    expect(body.system).not.toContain('Primer mensaje (obligatorio)');
  });

  it('negocio no encontrado → null y NO se llama a Claude', async () => {
    const { service, mocks } = makeService();
    mocks.businessFindFirst.mockResolvedValue(null);

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fallo de red/timeout de Claude → null, sin lanzar', async () => {
    const { service } = makeService();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });

  it('HTTP de error de Claude (429/5xx) → null, sin lanzar', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: { type: 'rate_limit_error', message: 'slow down' },
        }),
    });

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });

  it('respuesta sin texto → null', async () => {
    const { service } = makeService();
    fetchMock.mockResolvedValue(
      okResponse({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
    );

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });
});

describe('mapHistoryToTurns', () => {
  it('mapea IN → user y OUT → assistant en orden', () => {
    const turns = mapHistoryToTurns([
      { direction: MessageDirection.IN, body: 'Hola' },
      { direction: MessageDirection.OUT, body: '¡Hola! Soy el asistente…' },
      { direction: MessageDirection.IN, body: '¿Precios?' },
    ]);

    expect(turns).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¡Hola! Soy el asistente…' },
      { role: 'user', content: '¿Precios?' },
    ]);
  });

  it('descarta turnos assistant iniciales (la API exige empezar por user)', () => {
    const turns = mapHistoryToTurns([
      { direction: MessageDirection.OUT, body: 'respuesta recortada' },
      { direction: MessageDirection.IN, body: 'Hola' },
    ]);

    expect(turns).toEqual([{ role: 'user', content: 'Hola' }]);
  });

  it('historial sin ningún IN → vacío', () => {
    expect(
      mapHistoryToTurns([
        { direction: MessageDirection.OUT, body: 'solo salientes' },
      ]),
    ).toEqual([]);
  });
});
