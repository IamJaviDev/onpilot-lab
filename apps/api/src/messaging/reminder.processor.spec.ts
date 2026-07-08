import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReminderJobData } from '../reminders/reminders.service';
import type { ConversationService } from './conversation.service';
import { ReminderProcessor } from './reminder.processor';
import { WhatsAppSendError, type WhatsAppAdapter } from './whatsapp.adapter';

// Tests del processor de recordatorios (H2 T7). Lo que se protege: los
// descartes tras releer BD (inexistente / cancelada / fecha cambiada /
// conversación intervenida), el flag estricto, el 131047 sin reintentos, el
// throw en otros errores (para los reintentos de BullMQ), y el camino feliz
// con y sin conversación previa.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const APPOINTMENT_ID = 'a0000000-0000-0000-0000-000000000001';
const CLIENT_ID = 'cl000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'cv000000-0000-0000-0000-000000000001';

// Mañana: futura y con el "de mañana" del texto determinista.
const STARTS_AT = new Date(Date.now() + 24 * 60 * 60 * 1000);

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    clientId: CLIENT_ID,
    startsAt: STARTS_AT,
    status: 'CONFIRMED',
    notes: null,
    client: { name: 'Ana', phone: '+34600000001' },
    service: { name: 'Corte de pelo' },
    business: { name: 'Estética Luz', timezone: 'Europe/Madrid' },
    ...overrides,
  };
}

function job(data: Partial<ReminderJobData> = {}): Job<ReminderJobData> {
  return {
    data: {
      businessId: BUSINESS_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt: STARTS_AT.toISOString(),
      ...data,
    },
  } as Job<ReminderJobData>;
}

interface Mocks {
  processor: ReminderProcessor;
  appointmentFindFirst: jest.Mock;
  conversationFindFirst: jest.Mock;
  conversationCreate: jest.Mock;
  sendText: jest.Mock;
  persistOutgoing: jest.Mock;
}

function makeProcessor(env: Record<string, string> = {}): Mocks {
  const appointmentFindFirst = jest.fn().mockResolvedValue(appointmentRow());
  const conversationFindFirst = jest
    .fn()
    .mockResolvedValue({ id: CONVERSATION_ID, status: 'BOT_ACTIVE' });
  const conversationCreate = jest
    .fn()
    .mockResolvedValue({ id: CONVERSATION_ID });
  const sendText = jest.fn().mockResolvedValue({ waMessageId: 'wamid.OUT' });
  const persistOutgoing = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    appointment: { findFirst: appointmentFindFirst },
    conversation: {
      findFirst: conversationFindFirst,
      create: conversationCreate,
    },
  } as unknown as PrismaService;
  const whatsapp = { sendText } as unknown as WhatsAppAdapter;
  const conversations = { persistOutgoing } as unknown as ConversationService;
  const config = {
    get: (key: string) => ({ REMINDERS_ENABLED: 'true', ...env })[key],
  } as unknown as ConfigService;

  return {
    processor: new ReminderProcessor(prisma, whatsapp, conversations, config),
    appointmentFindFirst,
    conversationFindFirst,
    conversationCreate,
    sendText,
    persistOutgoing,
  };
}

describe('ReminderProcessor — flag', () => {
  it('REMINDERS_ENABLED off → descarta sin tocar BD ni enviar (jobs encolados de antes)', async () => {
    const m = makeProcessor({ REMINDERS_ENABLED: 'false' });
    await m.processor.process(job());
    expect(m.appointmentFindFirst).not.toHaveBeenCalled();
    expect(m.sendText).not.toHaveBeenCalled();
  });
});

describe('ReminderProcessor — descartes tras releer BD', () => {
  it('cita inexistente → descarta sin enviar', async () => {
    const m = makeProcessor();
    m.appointmentFindFirst.mockResolvedValue(null);
    await m.processor.process(job());
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('cita cancelada → descarta sin enviar', async () => {
    const m = makeProcessor();
    m.appointmentFindFirst.mockResolvedValue(
      appointmentRow({ status: 'CANCELLED' }),
    );
    await m.processor.process(job());
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('startsAt cambió desde que se programó (job huérfano) → descarta sin enviar', async () => {
    const m = makeProcessor();
    await m.processor.process(
      job({ startsAt: new Date(Date.now() + 48 * 3600_000).toISOString() }),
    );
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('conversación en PENDING_REVIEW (equipo al mando) → descarta sin enviar', async () => {
    const m = makeProcessor();
    m.conversationFindFirst.mockResolvedValue({
      id: CONVERSATION_ID,
      status: 'PENDING_REVIEW',
    });
    await m.processor.process(job());
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it('conversación en HUMAN_CONTROL → descarta sin enviar', async () => {
    const m = makeProcessor();
    m.conversationFindFirst.mockResolvedValue({
      id: CONVERSATION_ID,
      status: 'HUMAN_CONTROL',
    });
    await m.processor.process(job());
    expect(m.sendText).not.toHaveBeenCalled();
  });
});

describe('ReminderProcessor — camino feliz', () => {
  it('conversación BOT_ACTIVE existente → envía y persiste el OUT con metadata { reminder, appointmentId }', async () => {
    const m = makeProcessor();

    await m.processor.process(job());

    expect(m.conversationCreate).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledTimes(1);
    const [to, body] = m.sendText.mock.calls[0] as [string, string];
    expect(to).toBe('+34600000001');
    expect(body).toContain('Ana');
    expect(body).toContain('Estética Luz');
    expect(body).toContain('Corte de pelo');
    expect(body).toContain('de mañana');

    expect(m.persistOutgoing).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      body,
      waMessageId: 'wamid.OUT',
      metadata: { reminder: true, appointmentId: APPOINTMENT_ID },
    });
  });

  it('sin conversación previa (cliente de la web) → la crea BOT_ACTIVE vinculada al Client y envía', async () => {
    const m = makeProcessor();
    m.conversationFindFirst.mockResolvedValue(null);

    await m.processor.process(job());

    expect(m.conversationCreate).toHaveBeenCalledWith({
      data: {
        businessId: BUSINESS_ID,
        clientId: CLIENT_ID,
        phone: '+34600000001',
        status: 'BOT_ACTIVE',
      },
      select: { id: true },
    });
    expect(m.sendText).toHaveBeenCalledTimes(1);
    expect(m.persistOutgoing).toHaveBeenCalledTimes(1);
  });

  it('cita con nota de tercero → el texto incluye el "a nombre de"', async () => {
    const m = makeProcessor();
    m.appointmentFindFirst.mockResolvedValue(
      appointmentRow({ notes: 'Reserva a nombre de: Iván (vía WhatsApp)' }),
    );

    await m.processor.process(job());

    const [, body] = m.sendText.mock.calls[0] as [string, string];
    expect(body).toContain('a nombre de Iván');
  });
});

describe('ReminderProcessor — errores de envío', () => {
  it('131047 (ventana de 24h cerrada) → completado-con-fallo: NO relanza y NO persiste OUT', async () => {
    const m = makeProcessor();
    m.sendText.mockRejectedValue(
      new WhatsAppSendError('window closed', 131047),
    );

    await expect(m.processor.process(job())).resolves.toBeUndefined();
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });

  it('otro error de envío → relanza (política de reintentos de BullMQ)', async () => {
    const m = makeProcessor();
    m.sendText.mockRejectedValue(new WhatsAppSendError('HTTP 500', 1));

    await expect(m.processor.process(job())).rejects.toBeInstanceOf(
      WhatsAppSendError,
    );
    expect(m.persistOutgoing).not.toHaveBeenCalled();
  });
});
