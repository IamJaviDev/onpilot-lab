import type { ConfigService } from '@nestjs/config';
import { ConversationStatus } from '../generated/prisma/client';
import type {
  ConversationService,
  PersistIncomingResult,
} from './conversation.service';
import { WebhookService } from './webhook.service';
import type { WhatsAppAdapter } from './whatsapp.adapter';
import type { WhatsAppWebhookPayload } from './whatsapp-payload.types';

// Tests del flujo del eco (Tarea 3) con adapter y persistencia mockeados.
// Lo que se protege: el eco solo sale con flag exacto 'true' + IN persistido
// + conversación BOT_ACTIVE, y un fallo de envío jamás rompe la recepción.

const PHONE_NUMBER_ID = 'PHONE123';
const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';

interface Mocks {
  service: WebhookService;
  persistIncoming: jest.Mock;
  persistOutgoing: jest.Mock;
  sendText: jest.Mock;
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

  return {
    service: new WebhookService(config, conversations, whatsapp),
    persistIncoming,
    persistOutgoing,
    sendText,
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

describe('WebhookService — eco temporal (Tarea 3)', () => {
  it('con flag "true" y BOT_ACTIVE: envía el eco y persiste el OUT con el wamid', async () => {
    const m = makeService({ MESSAGING_ECHO_ENABLED: 'true' });

    await m.service.handleIncoming(textPayload('Hola'));

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.sendText).toHaveBeenCalledTimes(1);
    const expectedEcho =
      '🤖 Eco de prueba de Onpilot: recibido "Hola". (El asistente llegará pronto.)';
    expect(m.sendText).toHaveBeenCalledWith('34600000000', expectedEcho);
    expect(m.persistOutgoing).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      body: expectedEcho,
      waMessageId: 'wamid.OUT-0001',
    });
  });

  it('si el envío falla: el IN queda persistido, no hay OUT y no se propaga el error', async () => {
    const m = makeService({ MESSAGING_ECHO_ENABLED: 'true' });
    m.sendText.mockRejectedValue(new Error('window closed'));

    await expect(
      m.service.handleIncoming(textPayload()),
    ).resolves.toBeUndefined();

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('en HUMAN_CONTROL no hay eco (el sistema no responde)', async () => {
    const m = makeService({ MESSAGING_ECHO_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({
      persisted: true,
      conversationId: CONVERSATION_ID,
      conversationStatus: ConversationStatus.HUMAN_CONTROL,
    });

    await m.service.handleIncoming(textPayload());

    expect(m.persistIncoming).toHaveBeenCalledTimes(1);
    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('en PENDING_REVIEW no hay eco', async () => {
    const m = makeService({ MESSAGING_ECHO_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({
      persisted: true,
      conversationId: CONVERSATION_ID,
      conversationStatus: ConversationStatus.PENDING_REVIEW,
    });

    await m.service.handleIncoming(textPayload());

    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('en duplicado (dedupe, persisted:false) no hay eco', async () => {
    const m = makeService({ MESSAGING_ECHO_ENABLED: 'true' });
    m.persistIncoming.mockResolvedValue({ persisted: false });

    await m.service.handleIncoming(textPayload());

    expect(m.sendText).not.toHaveBeenCalled();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  // Default silencioso a prueba de typos: SOLO el string exacto 'true' activa
  // el eco. Cualquier otra cosa (mayúsculas, '1', 'false', vacío, ausente) = off.
  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ["'TRUE'", 'TRUE'],
    ["'True'", 'True'],
    ["'1'", '1'],
    ["'false'", 'false'],
    ["'true ' (espacio)", 'true '],
  ])(
    'flag %s → NO hay eco, pero el IN se persiste igual',
    async (_label, value) => {
      const m = makeService({ MESSAGING_ECHO_ENABLED: value });

      await m.service.handleIncoming(textPayload());

      expect(m.persistIncoming).toHaveBeenCalledTimes(1);
      expect(m.sendText).not.toHaveBeenCalled();
      expect(m.persistOutgoing).not.toHaveBeenCalled();
    },
  );
});
