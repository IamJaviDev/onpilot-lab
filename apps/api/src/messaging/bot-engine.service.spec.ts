import type { ConfigService } from '@nestjs/config';
import { MessageDirection } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  BotEngineService,
  detectPhantomClaims,
  mapHistoryToTurns,
} from './bot-engine.service';
import type { BotToolsService } from './bot-tools.service';

// Tests del BotEngine (T4 + T5 + T6) con el SDK de Anthropic y Prisma
// mockeados. Lo que se protege: las queries van SIEMPRE filtradas por
// businessId, el bucle de tool use ejecuta las tools server-side y respeta el
// tope de 5 iteraciones, la metadata acumula tokens y audita el escalado, la
// guardia anti-fantasma cubre reserva/cancelación/escalado, todo fallback que
// promete equipo ESCALA de verdad (opción A de T6), y cualquier fallo del SDK
// devuelve null sin lanzar.

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';
const SERVICE_ID = 's0000000-0000-0000-0000-000000000001';

interface PrismaMocks {
  businessFindFirst: jest.Mock;
  serviceFindMany: jest.Mock;
  messageFindFirst: jest.Mock;
  messageFindMany: jest.Mock;
}

function makeService(): {
  service: BotEngineService;
  mocks: PrismaMocks;
  toolsExecute: jest.Mock;
  transitionToPendingReview: jest.Mock;
} {
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
      {
        id: SERVICE_ID,
        name: 'Cesta de fruta',
        basePrice: 25,
        durationMinutes: 30,
      },
    ]),
    // Sin OUT previo del BOT por defecto → primera respuesta.
    messageFindFirst: jest.fn().mockResolvedValue(null),
    messageFindMany: jest.fn().mockResolvedValue([
      // Orden createdAt desc, como la query real.
      { direction: MessageDirection.IN, body: 'Hola, quiero una cita' },
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

  const toolsExecute = jest.fn().mockResolvedValue({
    ok: true,
    result: { slots: ['2026-07-13T10:00'] },
  });
  const transitionToPendingReview = jest.fn().mockResolvedValue(true);
  const botTools = {
    execute: toolsExecute,
    transitionToPendingReview,
  } as unknown as BotToolsService;

  return {
    service: new BotEngineService(config, prisma, botTools),
    mocks,
    toolsExecute,
    transitionToPendingReview,
  };
}

function textResponse(
  text: string,
  usage = { input_tokens: 800, output_tokens: 90 },
) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage,
  };
}

function toolUseResponse(
  id: string,
  name: string,
  input: Record<string, unknown>,
  usage = { input_tokens: 900, output_tokens: 60 },
) {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Voy a consultar la agenda…' },
      { type: 'tool_use', id, name, input },
    ],
    usage,
  };
}

describe('BotEngineService', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
    mockMessagesCreate.mockResolvedValue(
      textResponse('Hola, ¿en qué te ayudo?'),
    );
  });

  it('sin tools: devuelve el texto con metadata de tokens y sin toolCalls', async () => {
    const { service } = makeService();

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply).toEqual({
      body: 'Hola, ¿en qué te ayudo?',
      metadata: {
        inputTokens: 800,
        outputTokens: 90,
        model: 'claude-haiku-4-5',
      },
    });

    // La request lleva el modelo constante, las tools declaradas y el system
    // prompt con los datos reales (incluido el id del servicio para tools).
    const [args] = mockMessagesCreate.mock.calls[0] as [
      {
        model: string;
        system: string;
        tools: Array<{ name: string }>;
        messages: Array<{ role: string; content: unknown }>;
      },
    ];
    expect(args.model).toBe('claude-haiku-4-5');
    expect(args.tools.map((t) => t.name)).toEqual([
      'consultar_disponibilidad',
      'crear_cita',
      'listar_mis_citas',
      'cancelar_cita',
      'escalar_a_humano',
    ]);
    expect(args.system).toContain('Fruteria Javier');
    expect(args.system).toContain(`id: ${SERVICE_ID}`);
    // Fecha actual inyectada (fix post-T5): día de semana + año, en español.
    expect(args.system).toMatch(/Hoy es \p{L}+, \d{1,2} de \p{L}+ de \d{4}/u);
    expect(args.messages).toEqual([
      { role: 'user', content: 'Hola, quiero una cita' },
    ]);
  });

  it('bucle de tools: ejecuta la tool server-side, devuelve tool_result y termina con el texto final', async () => {
    const { service, toolsExecute } = makeService();
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'consultar_disponibilidad', {
          serviceId: SERVICE_ID,
          fecha: '2026-07-13',
        }),
      )
      .mockResolvedValueOnce(
        textResponse('El lunes tengo a las 10:00. ¿Te va bien?', {
          input_tokens: 1100,
          output_tokens: 40,
        }),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    // La tool se ejecuta con el contexto server-side (businessId de la
    // conversación) y el input del modelo.
    expect(toolsExecute).toHaveBeenCalledWith(
      { businessId: BUSINESS_ID, conversationId: CONVERSATION_ID },
      'consultar_disponibilidad',
      { serviceId: SERVICE_ID, fecha: '2026-07-13' },
    );

    // Segunda request: turno assistant completo + tool_result en UN user.
    const [secondArgs] = mockMessagesCreate.mock.calls[1] as [
      { messages: Array<{ role: string; content: unknown }> },
    ];
    expect(secondArgs.messages).toHaveLength(3);
    expect(secondArgs.messages[1].role).toBe('assistant');
    expect(secondArgs.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tu_1',
          content: JSON.stringify({ slots: ['2026-07-13T10:00'] }),
        },
      ],
    });

    // Tokens ACUMULADOS de las 2 iteraciones + registro de toolCalls.
    expect(reply).toEqual({
      body: 'El lunes tengo a las 10:00. ¿Te va bien?',
      metadata: {
        inputTokens: 2000,
        outputTokens: 100,
        model: 'claude-haiku-4-5',
        toolCalls: [{ name: 'consultar_disponibilidad', ok: true }],
      },
    });
  });

  it('tope de 5 iteraciones: corta el bucle con la respuesta de fallback y ESCALA de verdad (opción A)', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    mockMessagesCreate.mockResolvedValue(
      toolUseResponse('tu_x', 'consultar_disponibilidad', { fecha: 'x' }),
    );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(mockMessagesCreate).toHaveBeenCalledTimes(5);
    expect(toolsExecute).toHaveBeenCalledTimes(5);
    expect(reply?.body).toContain('aviso al equipo');
    expect(reply?.metadata.toolCalls).toHaveLength(5);
    // El fallback promete equipo → conversación a PENDING_REVIEW + auditoría.
    expect(transitionToPendingReview).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    expect(reply?.metadata.escalation).toEqual({
      motivo: 'NO_PUEDO_RESOLVER',
    });
  });

  it('multi-tenancy: TODAS las queries van filtradas por businessId', async () => {
    const { service, mocks } = makeService();

    await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

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
    let [args] = mockMessagesCreate.mock.calls[0] as [{ system: string }];
    expect(args.system).toContain('Primer mensaje (obligatorio)');

    mocks.messageFindFirst.mockResolvedValue({ id: 'previous-out' });
    await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    [args] = mockMessagesCreate.mock.calls[1] as [{ system: string }];
    expect(args.system).not.toContain('Primer mensaje (obligatorio)');
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
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('fallo del SDK (red/timeout/429 agotados los retries) → null, sin lanzar', async () => {
    const { service } = makeService();
    mockMessagesCreate.mockRejectedValue(new Error('network down'));

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });

  it('fallo del SDK a mitad del bucle (tras una tool) → null, sin lanzar', async () => {
    const { service } = makeService();
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'consultar_disponibilidad', { fecha: 'x' }),
      )
      .mockRejectedValueOnce(new Error('overloaded'));

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });

  it('refusal → null', async () => {
    const { service } = makeService();
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
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
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });
});

describe('detectPhantomClaims (detector puro de la guardia anti-fantasma, T5 + T6)', () => {
  it.each([
    [
      'participio + cita',
      'Tu cita queda confirmada para el martes a las 10:00.',
    ],
    [
      'perfecto + cita',
      '¡Listo! He reservado tu cita para mañana a las 10:00.',
    ],
    ['participio + reserva', '¡Perfecto, Ana! Tu reserva está confirmada.'],
    ['cita creada', 'Cita creada: Cesta de fruta, lunes 13 a las 10:00.'],
  ])('reserva — dispara: %s', (_label, text) => {
    expect(detectPhantomClaims(text)).toEqual(['booking']);
  });

  it.each([
    ['participio + cita', 'Tu cita del jueves queda cancelada.'],
    ['perfecto + cita', '¡Hecho! He cancelado tu cita del jueves.'],
    ['cambio', 'Tu cita queda cambiada al viernes a las 10:00.'],
    ['anulada + reserva', 'Listo, tu reserva está anulada.'],
    ['reprogramada', 'Tu cita ha sido reprogramada al viernes.'],
  ])('cancelación/cambio — dispara: %s', (_label, text) => {
    expect(detectPhantomClaims(text)).toEqual(['cancellation']);
  });

  it.each([
    ['aviso al equipo', 'Aviso al equipo para que te atiendan.'],
    ['perfecto', 'Ya he trasladado tu consulta al equipo.'],
    ['te paso con persona', 'Te paso con una persona del equipo.'],
    [
      'equipo avisado (orden inverso)',
      'El equipo ya está avisado y te responderá aquí mismo.',
    ],
    [
      'despedida de escalado (legítima SOLO con tool ok)',
      'Te paso con el equipo de Fruteria Javier; te responderán aquí mismo.',
    ],
  ])('escalado — dispara: %s', (_label, text) => {
    expect(detectPhantomClaims(text)).toEqual(['escalation']);
  });

  it.each([
    [
      'recapitulación de reserva (presente 1.ª persona)',
      'Te confirmo: Cesta de fruta, martes 9 de julio a las 10:00, ¿correcto?',
    ],
    [
      'recapitulación de cancelación (pregunta)',
      '¿Cancelo tu Consulta del jueves 9 a las 13:00?',
    ],
    ['oferta de escalado (pregunta)', '¿Quieres que avise al equipo?'],
    ['sin afirmación', 'No tengo huecos el martes para tu cita.'],
    ['pregunta de intención', '¿Quieres que reserve la cita para el martes?'],
    ['sin contexto de cita', 'Nuestros precios están confirmados en la lista.'],
    [
      'cancelar en infinitivo (instrucción, no afirmación)',
      'Para cancelar tu cita necesito que me digas cuál.',
    ],
    ['mención neutra del equipo', 'El equipo estará encantado de recibirte.'],
  ])('NO dispara: %s', (_label, text) => {
    expect(detectPhantomClaims(text)).toEqual([]);
  });

  it('confirmación de reprogramación: afirma reserva Y cancelación (exige AMBAS tools ok)', () => {
    expect(
      detectPhantomClaims(
        'Tu cita queda cambiada: he cancelado la del jueves y la nueva del viernes está confirmada.',
      ),
    ).toEqual(['booking', 'cancellation']);
  });

  // Comportamiento documentado (añadido (a) del CHECK de T5): futuro o
  // condicional con participio SÍ dispara. Sin la tool ok en el turno degrada
  // al fallback honesto (que desde T6 escala de verdad) — aceptable: nunca
  // deja pasar una promesa sin respaldo de tool.
  it('dispara con futuro/condicional + participio (degradación aceptada a fallback honesto)', () => {
    expect(
      detectPhantomClaims(
        'Tu cita quedará confirmada cuando el equipo la revise.',
      ),
    ).toEqual(['booking']);
  });
});

describe('BotEngineService — guardia anti-fantasma (fix 3 post-T5)', () => {
  const PHANTOM_TEXT =
    '¡Perfecto! Tu cita queda confirmada para el miércoles 8 a las 10:00.';

  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('escenario del bug: confirmación sin tool → corrección; si persiste → fallback, el texto fantasma JAMÁS se devuelve y se escala de verdad (opción A)', async () => {
    const { service, transitionToPendingReview } = makeService();
    mockMessagesCreate
      .mockResolvedValueOnce(textResponse(PHANTOM_TEXT))
      .mockResolvedValueOnce(
        textResponse(
          'Como te decía, tu cita queda confirmada. ¡Hasta el miércoles!',
        ),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    // Dos llamadas: la original + la iteración correctiva.
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);

    // La corrección viajó como user message interno del bucle…
    const [secondArgs] = mockMessagesCreate.mock.calls[1] as [
      { messages: Array<{ role: string; content: unknown }> },
    ];
    const lastMessage = secondArgs.messages[secondArgs.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toContain(
      'No has llamado a crear_cita en este turno',
    );

    // …y el modelo persistió → fallback seguro, texto fantasma suprimido.
    expect(reply?.body).toBe(
      'No he podido completar la reserva ahora mismo, aviso al equipo para ' +
        'que te la confirmen. ¡Disculpa las molestias!',
    );
    expect(reply?.body).not.toContain('queda confirmada');
    expect(reply?.metadata.phantomGuard).toBe('suppressed');

    // Opción A (T6): el fallback promete equipo → escalado REAL + auditoría.
    expect(transitionToPendingReview).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    expect(reply?.metadata.escalation).toEqual({
      motivo: 'NO_PUEDO_RESOLVER',
    });
  });

  it('corrección eficaz: tras el aviso el modelo llama a crear_cita y la confirmación pasa (phantomGuard: corrected)', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute.mockResolvedValue({ ok: true, result: { creada: true } });
    mockMessagesCreate
      .mockResolvedValueOnce(textResponse(PHANTOM_TEXT))
      .mockResolvedValueOnce(
        toolUseResponse('tu_9', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-13T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        textResponse(
          '¡Listo! Tu cita queda confirmada para el lunes 13 a las 10:00.',
        ),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      '¡Listo! Tu cita queda confirmada para el lunes 13 a las 10:00.',
    );
    expect(reply?.metadata.phantomGuard).toBe('corrected');
    expect(reply?.metadata.toolCalls).toEqual([
      { name: 'crear_cita', ok: true },
    ]);
  });

  it('caso legítimo: crear_cita ok en el turno → la confirmación pasa sin fricción ni metadata de guardia', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute.mockResolvedValue({ ok: true, result: { creada: true } });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-13T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        textResponse(
          '¡Hecho! Tu cita queda confirmada para el lunes 13 a las 10:00.',
        ),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    expect(reply?.body).toBe(
      '¡Hecho! Tu cita queda confirmada para el lunes 13 a las 10:00.',
    );
    expect(reply?.metadata.phantomGuard).toBeUndefined();
  });

  it('texto sin pretensión de reserva → pasa sin fricción aunque no haya tools', async () => {
    const { service, transitionToPendingReview } = makeService();
    mockMessagesCreate.mockResolvedValue(
      textResponse('La cesta de fruta cuesta 25.00 € y dura 30 min.'),
    );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(reply?.body).toBe('La cesta de fruta cuesta 25.00 € y dura 30 min.');
    expect(reply?.metadata.phantomGuard).toBeUndefined();
    expect(transitionToPendingReview).not.toHaveBeenCalled();
  });
});

describe('BotEngineService — escalado real (T6)', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('escalar_a_humano ok: la despedida pasa la guardia y la metadata audita el motivo', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    // La transición la hace la PROPIA tool (server-side); el engine no debe
    // repetirla.
    toolsExecute.mockResolvedValue({
      ok: true,
      result: { escalado: true, motivo: 'PIDE_HUMANO' },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'escalar_a_humano', { motivo: 'PIDE_HUMANO' }),
      )
      .mockResolvedValueOnce(
        textResponse(
          'Te paso con el equipo de Fruteria Javier; te responderán aquí mismo.',
        ),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(toolsExecute).toHaveBeenCalledWith(
      { businessId: BUSINESS_ID, conversationId: CONVERSATION_ID },
      'escalar_a_humano',
      { motivo: 'PIDE_HUMANO' },
    );
    expect(reply?.body).toBe(
      'Te paso con el equipo de Fruteria Javier; te responderán aquí mismo.',
    );
    expect(reply?.metadata.phantomGuard).toBeUndefined();
    expect(reply?.metadata.escalation).toEqual({ motivo: 'PIDE_HUMANO' });
    expect(transitionToPendingReview).not.toHaveBeenCalled();
  });

  it('aviso fantasma (el bug v0): "aviso al equipo" sin tool → corrección; si persiste → fallback que SÍ escala', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    mockMessagesCreate
      .mockResolvedValueOnce(
        textResponse('Entiendo. Aviso al equipo para que te atiendan.'),
      )
      .mockResolvedValueOnce(
        textResponse('Tranquilo, ya he avisado al equipo.'),
      );

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    // La corrección exige la tool…
    const [secondArgs] = mockMessagesCreate.mock.calls[1] as [
      { messages: Array<{ role: string; content: unknown }> },
    ];
    const lastMessage = secondArgs.messages[secondArgs.messages.length - 1];
    expect(lastMessage.content).toContain(
      'No has llamado a escalar_a_humano en este turno',
    );

    // …el modelo persistió → el backend hace verdad la promesa (opción A).
    expect(toolsExecute).not.toHaveBeenCalled();
    expect(transitionToPendingReview).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    expect(reply?.body).toBe(
      'Aviso al equipo para que te atiendan en cuanto puedan; te responderán ' +
        'aquí mismo.',
    );
    expect(reply?.metadata.phantomGuard).toBe('suppressed');
    expect(reply?.metadata.escalation).toEqual({
      motivo: 'NO_PUEDO_RESOLVER',
    });
  });
});

describe('BotEngineService — FIX 1: acción con efecto JAMÁS acaba en silencio', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('escalado silencioso (el bug del log 23:52): escalar_a_humano ok + texto vacío → despedida fija con el negocio, no null', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    toolsExecute.mockResolvedValue({
      ok: true,
      result: { escalado: true, motivo: 'PIDE_HUMANO' },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'escalar_a_humano', { motivo: 'PIDE_HUMANO' }),
      )
      .mockResolvedValueOnce(textResponse(''));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      'Te paso con el equipo de Fruteria Javier; te responderán aquí mismo.',
    );
    expect(reply?.metadata.escalation).toEqual({ motivo: 'PIDE_HUMANO' });
    // La transición ya la hizo la tool; el engine no la repite.
    expect(transitionToPendingReview).not.toHaveBeenCalled();
  });

  it('crear_cita ok + texto vacío → confirmación mínima con los datos del tool_result', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute.mockResolvedValue({
      ok: true,
      result: {
        creada: true,
        cita: {
          servicio: 'Cesta de fruta',
          fecha: '2026-07-13',
          hora: '10:00',
          nombreCliente: 'Ana',
        },
      },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-13T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(textResponse(''));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      '¡Hecho! Tu cita queda confirmada: Cesta de fruta el 2026-07-13 a las 10:00.',
    );
  });

  it('cancelar_cita ok + texto vacío → confirmación mínima de la cancelación', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute.mockResolvedValue({
      ok: true,
      result: {
        cancelada: true,
        cita: {
          servicio: 'Cesta de fruta',
          fecha: '2026-07-13',
          hora: '10:00',
        },
      },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'cancelar_cita', {
          appointmentId: 'a0000000-0000-0000-0000-000000000099',
        }),
      )
      .mockResolvedValueOnce(textResponse(''));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      'Hecho: tu cita de Cesta de fruta el 2026-07-13 a las 10:00 queda cancelada.',
    );
  });

  it('reprogramación completa (crear ok + cancelar ok) + texto vacío → confirmación fija del cambio', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute
      .mockResolvedValueOnce({
        ok: true,
        result: {
          creada: true,
          cita: {
            servicio: 'Cesta de fruta',
            fecha: '2026-07-17',
            hora: '10:00',
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, result: { cancelada: true } });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-17T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse('tu_2', 'cancelar_cita', { appointmentId: 'a-vieja' }),
      )
      .mockResolvedValueOnce(textResponse(''));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      '¡Hecho! Tu cita queda cambiada a Cesta de fruta el 2026-07-17 a las 10:00; la anterior queda cancelada.',
    );
  });

  it('fallo del SDK DESPUÉS de escalar_a_humano ok → despedida fija, no silencio', async () => {
    const { service, toolsExecute } = makeService();
    toolsExecute.mockResolvedValue({
      ok: true,
      result: { escalado: true, motivo: 'FRUSTRACION' },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'escalar_a_humano', { motivo: 'FRUSTRACION' }),
      )
      .mockRejectedValueOnce(new Error('overloaded'));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      'Te paso con el equipo de Fruteria Javier; te responderán aquí mismo.',
    );
    expect(reply?.metadata.escalation).toEqual({ motivo: 'FRUSTRACION' });
  });

  it('sin tools con efecto (solo consulta) + texto vacío → null como siempre (T4)', async () => {
    const { service } = makeService();
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'consultar_disponibilidad', {
          serviceId: SERVICE_ID,
          fecha: '2026-07-13',
        }),
      )
      .mockResolvedValueOnce(textResponse(''));

    await expect(
      service.generateReply({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
      }),
    ).resolves.toBeNull();
  });
});

describe('BotEngineService — reprogramación con fallo parcial (T6)', () => {
  const RESCHEDULE_CLAIM =
    '¡Listo! Tu cita queda cambiada al viernes a las 10:00.';

  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('crear_cita falla (hueco volado): la pretensión "queda cambiada" se intercepta y cancelar_cita nunca llega a ejecutarse', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    toolsExecute.mockResolvedValueOnce({
      ok: false,
      result: { error: 'Ese hueco acaba de ocuparse…' },
    });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-17T10:00',
          nombreCliente: 'Ana',
        }),
      )
      // El modelo miente pese al error de la tool, y persiste tras el aviso.
      .mockResolvedValueOnce(textResponse(RESCHEDULE_CLAIM))
      .mockResolvedValueOnce(textResponse(RESCHEDULE_CLAIM));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    // La cita original queda intacta: cancelar_cita jamás se ejecutó.
    expect(toolsExecute).toHaveBeenCalledTimes(1);
    const [firstCall] = toolsExecute.mock.calls as [[unknown, string]];
    expect(firstCall[1]).toBe('crear_cita');
    // El texto fantasma nunca sale; fallback honesto + escalado real.
    expect(reply?.body).toBe(
      'No he podido completar la gestión de tu cita ahora mismo, aviso al ' +
        'equipo para que lo revisen. ¡Disculpa las molestias!',
    );
    expect(reply?.metadata.phantomGuard).toBe('suppressed');
    expect(transitionToPendingReview).toHaveBeenCalled();
  });

  it('crear_cita ok pero cancelar_cita falla: "queda cambiada" sigue sin respaldo (exige cancelar_cita ok) → interceptado', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    toolsExecute
      .mockResolvedValueOnce({ ok: true, result: { creada: true } })
      .mockResolvedValueOnce({
        ok: false,
        result: { error: 'Esa cita acaba de cambiar…' },
      });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-17T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse('tu_2', 'cancelar_cita', {
          appointmentId: 'a-vieja',
        }),
      )
      .mockResolvedValueOnce(textResponse(RESCHEDULE_CLAIM))
      .mockResolvedValueOnce(textResponse(RESCHEDULE_CLAIM));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(toolsExecute).toHaveBeenCalledTimes(2);
    // FIX 4: el fallback NO es el genérico — cuenta el duplicado honesto.
    expect(reply?.body).toBe(
      'He creado tu cita nueva pero no he podido anular la anterior — te ' +
        'han quedado las dos; aviso al equipo para que lo corrijan.',
    );
    expect(reply?.metadata.phantomGuard).toBe('suppressed');
    expect(reply?.metadata.toolCalls).toEqual([
      { name: 'crear_cita', ok: true },
      { name: 'cancelar_cita', ok: false },
    ]);
    expect(reply?.metadata.escalation).toEqual({
      motivo: 'NO_PUEDO_RESOLVER',
    });
    expect(transitionToPendingReview).toHaveBeenCalled();
  });

  it('FIX 1+4 integrado: crear ok + cancelar fallido + Claude CALLA (texto vacío) → texto honesto del duplicado + escalado + metadata', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    toolsExecute
      .mockResolvedValueOnce({ ok: true, result: { creada: true } })
      .mockResolvedValueOnce({
        ok: false,
        result: { error: 'Esa cita acaba de cambiar…' },
      });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-17T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse('tu_2', 'cancelar_cita', {
          appointmentId: 'a-vieja',
        }),
      )
      .mockResolvedValueOnce(textResponse(''));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(
      'He creado tu cita nueva pero no he podido anular la anterior — te ' +
        'han quedado las dos; aviso al equipo para que lo corrijan.',
    );
    expect(reply?.metadata.escalation).toEqual({
      motivo: 'NO_PUEDO_RESOLVER',
    });
    expect(transitionToPendingReview).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
  });

  it('reprogramación feliz (crear ok + cancelar ok): la confirmación del cambio pasa sin fricción', async () => {
    const { service, toolsExecute, transitionToPendingReview } = makeService();
    toolsExecute
      .mockResolvedValueOnce({ ok: true, result: { creada: true } })
      .mockResolvedValueOnce({ ok: true, result: { cancelada: true } });
    mockMessagesCreate
      .mockResolvedValueOnce(
        toolUseResponse('tu_1', 'crear_cita', {
          serviceId: SERVICE_ID,
          fechaHora: '2026-07-17T10:00',
          nombreCliente: 'Ana',
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse('tu_2', 'cancelar_cita', {
          appointmentId: 'a-vieja',
        }),
      )
      .mockResolvedValueOnce(textResponse(RESCHEDULE_CLAIM));

    const reply = await service.generateReply({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(reply?.body).toBe(RESCHEDULE_CLAIM);
    expect(reply?.metadata.phantomGuard).toBeUndefined();
    expect(transitionToPendingReview).not.toHaveBeenCalled();
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
