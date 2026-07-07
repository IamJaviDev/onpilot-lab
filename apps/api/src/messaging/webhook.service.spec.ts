import type { ConfigService } from '@nestjs/config';
import { ConversationStatus } from '../generated/prisma/client';
import type { BotEngineService, BotReply } from './bot-engine.service';
import type {
  ConversationService,
  PersistIncomingResult,
} from './conversation.service';
import { WebhookService } from './webhook.service';
import type { WhatsAppAdapter } from './whatsapp.adapter';
import type { WhatsAppWebhookPayload } from './whatsapp-payload.types';

// Tests de la orquestación del bot (Tarea 4) con BotEngine, adapter y
// persistencia mockeados. Lo que se protege: el bot solo responde con flag
// exacto 'true' + IN persistido + conversación BOT_ACTIVE; un null del
// BotEngine no envía nada; el OUT se persiste con la metadata de tokens; y
// ningún fallo (generación, envío, persistencia) rompe la recepción.

const PHONE_NUMBER_ID = 'PHONE123';
const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';

const BOT_REPLY: BotReply = {
  body: '¡Hola! Soy el asistente automático de Fruteria Javier. ¿Qué necesitas?',
  metadata: { inputTokens: 812, outputTokens: 96, model: 'claude-haiku-4-5' },
};

interface Mocks {
  service: WebhookService;
  persistIncoming: jest.Mock;
  persistOutgoing: jest.Mock;
  sendText: jest.Mock;
  generateReply: jest.Mock;
}

function makeService(env: Record<string, string | undefined>): Mocks {
  const fullEnv: Record<string, string | undefined> = {
    WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ID: BUSINESS_ID,
    ...env,
  };
  const config = {
    get: (key: string) => fullEnv[key],
    getOrThrow: (key: string) => {
      const value = fullEnv[key];
      if (value === undefined) throw new Error(`missing env ${key}`);
      return value;
    },
  } as unknown as ConfigService;

  const persistIncoming = jest.fn<Promise<PersistIncomingResult>, unknown[]>();
  persistIncoming.mockResolvedValue({
    persisted: true,
    conversationId: CONVERSATION_ID,
    conversationStatus: ConversationStatus.BOT_ACTIVE,
  });
  const persistOutgoing = jest.fn().mockResolvedValue(undefined);
  const conversations = {
    persistIncoming,
    persistOutgoing,
  } as unknown as ConversationService;

  const sendText = jest
    .fn()
    .mockResolvedValue({ waMessageId: 'wamid.OUT-0001' });
  const whatsapp = { sendText } as unknown as WhatsAppAdapter;

  const generateReply = jest.fn().mockResolvedValue(BOT_REPLY);
  const botEngine = { generateReply } as unknown as BotEngineService;

  return {
    service: new WebhookService(config, conversations, whatsapp, botEngine),
    persistIncoming,
    persistOutgoing,
    sendText,
    generateReply,
  };
}

function textPayload(body = 'Hola, quiero una cita'): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              messages: [
                {
                  from: '34600000000',
                  id: 'wamid.IN-0001',
                  timestamp: '1751731200',
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WebhookService — orquestación del BotEngine (Tarea 4)', () => {
  it('con flag "true" y BOT_ACTIVE: genera, envía y persiste el OUT con metadata de tokens', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });

    await m.service.handleIncoming(textPayload('Hola'));

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.generateReply).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
    });
    expect(m.sendText).toHaveBeenCalledWith('34600000000', BOT_REPLY.body);
    expect(m.persistOutgoing).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      body: BOT_REPLY.body,
      waMessageId: 'wamid.OUT-0001',
      metadata: {
        inputTokens: 812,
        outputTokens: 96,
        model: 'claude-haiku-4-5',
      },
    });
  });

  it('si el BotEngine devuelve null (fallo de Claude): el IN queda, no se envía nada, no hay OUT', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.generateReply.mockResolvedValue(null);

    await expect(
      m.service.handleIncoming(textPayload()),
    ).resolves.toBeUndefined();

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('si el BotEngine lanza: el IN queda persistido y el error no se propaga', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.generateReply.mockRejectedValue(new Error('unexpected'));

    await expect(
      m.service.handleIncoming(textPayload()),
    ).resolves.toBeUndefined();

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('si el envío falla: el IN queda persistido, no hay OUT y no se propaga el error', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.sendText.mockRejectedValue(new Error('window closed'));

    await expect(
      m.service.handleIncoming(textPayload()),
    ).resolves.toBeUndefined();

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('en HUMAN_CONTROL el bot no responde (el sistema calla fuera de BOT_ACTIVE)', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({
      persisted: true,
      conversationId: CONVERSATION_ID,
      conversationStatus: ConversationStatus.HUMAN_CONTROL,
    });

    await m.service.handleIncoming(textPayload());

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.generateReply).not.toHaveBeenCalled();
    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('en PENDING_REVIEW el bot no responde', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({
      persisted: true,
      conversationId: CONVERSATION_ID,
      conversationStatus: ConversationStatus.PENDING_REVIEW,
    });

    await m.service.handleIncoming(textPayload());

    expect(m.generateReply).not.toHaveBeenCalled();
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('en duplicado (dedupe, persisted:false) el bot no responde', async () => {
    const m = makeService({ BOT_ENGINE_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({ persisted: false });

    await m.service.handleIncoming(textPayload());

    expect(m.generateReply).not.toHaveBeenCalled();
    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  // Default silencioso a prueba de typos: SOLO el string exacto 'true' activa
  // el bot. Cualquier otra cosa (mayúsculas, '1', 'false', vacío, ausente) = off.
  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ["'TRUE'", 'TRUE'],
    ["'True'", 'True'],
    ["'1'", '1'],
    ["'false'", 'false'],
    ["'true ' (espacio)", 'true '],
  ])(
    'flag %s → el bot NO responde, pero el IN se persiste igual',
    async (_label, value) => {
      const m = makeService({ BOT_ENGINE_ENABLED: value });

      await m.service.handleIncoming(textPayload());

      expect(m.persistIncoming).toHaveBeenCalledTimes(1);
      expect(m.generateReply).not.toHaveBeenCalled();
      expect(m.sendText).not.toHaveBeenCalled();
      expect(m.persistOutgoing).not.toHaveBeenCalled();
    },
  );
});
