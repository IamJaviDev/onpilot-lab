import { BadRequestException, ConflictException } from '@nestjs/common';
import { DateTime, Settings } from 'luxon';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { ClientsService } from '../clients/clients.service';
import {
  AppointmentSource,
  ConversationStatus,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BotToolsService } from './bot-tools.service';

// Tests de la ejecución server-side de las tools (T5 + T6). Lo que se
// protege: multi-tenancy en cada query (businessId del contexto, jamás del
// modelo), resolución de cliente (vinculado / por teléfono / creación
// mínima), la regla de identidad de T6 (solo citas de los Client del teléfono
// de la conversación, con error ÚNICO e indistinguible para cita ajena /
// pasada / inactiva / de otro negocio), el escalado real (updateMany con
// id + businessId → PENDING_REVIEW), la carrera del hueco ocupado → error
// limpio SIN cita creada y legible por el modelo (sin stack), y errores de
// negocio nunca lanzados.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';
// Los ids que el modelo pasa como INPUT (serviceId, appointmentId) deben ser
// UUID-shape válidos: la validación del FIX 3 corta antes de Prisma.
const SERVICE_ID = 'e5000000-0000-0000-0000-000000000001';
const CLIENT_ID = 'cl000000-0000-0000-0000-000000000001';
const PHONE = '+34600000001';

const CONTEXT = { businessId: BUSINESS_ID, conversationId: CONVERSATION_ID };

// 2026-07-13 es lunes, futuro respecto al reloj fijo del spec (FIXED_TS).
const MONDAY = '2026-07-13';

// Reloj fijo del spec. Todo lo temporal del código bajo test —luxon
// DateTime.now() (bot-tools.service.ts:322,:431) y new Date() (:352,:561,:649)—
// cuelga de este instante. NO volver a anclar los tests a fechas relativas a
// "hoy": ese fue el bug #4 (13 tests fallando el 13/07 → 16 el 14/07; el conteo
// dependía del día de ejecución). 2026-07-10 09:00 en Europe/Madrid (verano,
// UTC+2) hace que 12, 13 y 14 de julio sean FUTURO respecto a este now, que es
// lo que sus tests prometen. Se construye con luxon para ser DST-safe.
const FIXED_TS = DateTime.fromISO('2026-07-10T09:00', {
  zone: 'Europe/Madrid',
}).toMillis();

beforeEach(() => {
  // luxon: DateTime.now() respeta Settings.now; los fake timers de Jest NO lo
  // tocan, hay que fijarlo aparte.
  Settings.now = () => FIXED_TS;
  // Date nativo: fingimos SOLO Date (no setTimeout/microtasks) para no colgar
  // los await del código async bajo test. new Date() y Date.now() → FIXED_TS.
  jest.useFakeTimers({
    now: FIXED_TS,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearImmediate',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'performance',
      'hrtime',
    ],
  });
});

afterEach(() => {
  Settings.now = () => Date.now(); // default de luxon, ya con Date real
  jest.useRealTimers();
});

interface Mocks {
  service: BotToolsService;
  prisma: {
    businessFindFirst: jest.Mock;
    serviceFindFirst: jest.Mock;
    appointmentFindMany: jest.Mock;
    appointmentFindFirst: jest.Mock;
    conversationFindFirst: jest.Mock;
    conversationUpdateMany: jest.Mock;
    clientFindFirst: jest.Mock;
    clientFindMany: jest.Mock;
  };
  appointmentsCreate: jest.Mock;
  appointmentsCancel: jest.Mock;
  clientsCreate: jest.Mock;
}

function makeService(): Mocks {
  const prismaMocks = {
    businessFindFirst: jest.fn().mockResolvedValue({
      timezone: 'Europe/Madrid',
      weeklySchedule: { mon: [{ start: '09:00', end: '14:00' }] },
    }),
    serviceFindFirst: jest.fn().mockResolvedValue({
      id: SERVICE_ID,
      name: 'Cesta de fruta',
      durationMinutes: 30,
    }),
    appointmentFindMany: jest.fn().mockResolvedValue([]),
    appointmentFindFirst: jest.fn().mockResolvedValue(null),
    conversationFindFirst: jest
      .fn()
      .mockResolvedValue({ clientId: null, phone: PHONE }),
    conversationUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    clientFindFirst: jest.fn().mockResolvedValue(null),
    clientFindMany: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    business: { findFirst: prismaMocks.businessFindFirst },
    service: { findFirst: prismaMocks.serviceFindFirst },
    appointment: {
      findMany: prismaMocks.appointmentFindMany,
      findFirst: prismaMocks.appointmentFindFirst,
    },
    conversation: {
      findFirst: prismaMocks.conversationFindFirst,
      updateMany: prismaMocks.conversationUpdateMany,
    },
    client: {
      findFirst: prismaMocks.clientFindFirst,
      findMany: prismaMocks.clientFindMany,
    },
  } as unknown as PrismaService;

  const appointmentsCreate = jest.fn().mockResolvedValue({
    id: 'a0000000-0000-0000-0000-000000000001',
    client: { id: CLIENT_ID, name: 'Ana', phone: PHONE },
    service: { id: SERVICE_ID, name: 'Cesta de fruta', basePrice: 25 },
    // 10:00 local Madrid en julio (UTC+2).
    startsAt: new Date(`${MONDAY}T08:00:00Z`),
    endsAt: new Date(`${MONDAY}T08:30:00Z`),
  });
  const appointmentsCancel = jest.fn().mockResolvedValue({ id: 'cancelled' });
  const appointments = {
    create: appointmentsCreate,
    cancel: appointmentsCancel,
  } as unknown as AppointmentsService;

  const clientsCreate = jest
    .fn()
    .mockResolvedValue({ id: CLIENT_ID, name: 'Ana', phone: PHONE });
  // clientFindFirst por defecto devuelve null (cliente desconocido); los
  // tests de cliente vinculado/por-teléfono lo sobreescriben con {id, name}.
  const clients = { create: clientsCreate } as unknown as ClientsService;

  return {
    service: new BotToolsService(prisma, appointments, clients),
    prisma: prismaMocks,
    appointmentsCreate,
    appointmentsCancel,
    clientsCreate,
  };
}

describe('BotToolsService — consultar_disponibilidad', () => {
  it('devuelve los huecos del día y consulta las citas con businessId + estados activos', async () => {
    const m = makeService();

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        serviceId: SERVICE_ID,
        fecha: MONDAY,
      },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({
      fecha: MONDAY,
      diaSemana: 'lunes',
      servicio: 'Cesta de fruta',
      masHuecos: true, // 10 huecos reales, recortados a 8
    });
    expect((outcome.result.slots as string[]).length).toBe(8);
    expect((outcome.result.slots as string[])[0]).toBe(`${MONDAY}T09:00`);

    // Multi-tenancy + criterio compartido de "cita que ocupa hueco".
    const where = (
      m.prisma.appointmentFindMany.mock.calls[0] as [
        { where: { businessId: string; status: { in: string[] } } },
      ]
    )[0].where;
    expect(where.businessId).toBe(BUSINESS_ID);
    expect(where.status.in).toEqual(['SCHEDULED', 'CONFIRMED']);
  });

  it('servicio de otro negocio (query filtrada no lo encuentra) → error de negocio', async () => {
    const m = makeService();
    m.prisma.serviceFindFirst.mockResolvedValue(null);

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        // UUID-shape válido pero ajeno: pasa la validación de forma y cae en
        // la query filtrada por businessId.
        serviceId: 'e5000000-0000-0000-0000-0000000000ff',
        fecha: MONDAY,
      },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toEqual({
      error: 'Servicio no encontrado en la lista de este negocio.',
    });
    const where = (
      m.prisma.serviceFindFirst.mock.calls[0] as [
        { where: { businessId: string } },
      ]
    )[0].where;
    expect(where.businessId).toBe(BUSINESS_ID);
  });

  it('sin horario configurado (weeklySchedule null) → error legible, sin inventar', async () => {
    const m = makeService();
    m.prisma.businessFindFirst.mockResolvedValue({
      timezone: 'Europe/Madrid',
      weeklySchedule: null,
    });

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        serviceId: SERVICE_ID,
        fecha: MONDAY,
      },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('no tiene horario configurado');
  });

  it('día cerrado → slots vacíos con motivo (nunca inventa)', async () => {
    const m = makeService();

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        serviceId: SERVICE_ID,
        fecha: '2026-07-14', // martes: sin intervalos en el horario del mock
      },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({
      diaSemana: 'martes',
      slots: [],
      motivo: 'El negocio está cerrado ese día.',
    });
  });

  it('fix 2 post-T5: diaSemana es el de la fecha LOCAL del negocio aunque la zona cruce de día respecto a UTC', async () => {
    const m = makeService();
    // Los Ángeles (UTC-7 en julio): si el cálculo usara medianoche UTC del
    // 2026-07-13 re-proyectada a la zona, caería en el domingo 12 local. El
    // día de la semana debe ser el de la FECHA pedida en la zona del negocio.
    m.prisma.businessFindFirst.mockResolvedValue({
      timezone: 'America/Los_Angeles',
      weeklySchedule: { mon: [{ start: '09:00', end: '14:00' }] },
    });

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      { serviceId: SERVICE_ID, fecha: MONDAY },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({ diaSemana: 'lunes' });
  });

  it('fecha pasada → error de negocio explícito con la fecha de hoy (no lista vacía)', async () => {
    const m = makeService();

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        serviceId: SERVICE_ID,
        fecha: '2020-01-06', // lunes de un año pasado (el típico año equivocado)
      },
    );

    expect(outcome.ok).toBe(false);
    const error = outcome.result.error as string;
    expect(error).toContain('Esa fecha ya pasó');
    expect(error).toMatch(/hoy es \d{4}-\d{2}-\d{2}/);
    expect(error).toContain('Consulta una fecha de hoy en adelante');
    // No llega a consultar citas: corta antes.
    expect(m.prisma.appointmentFindMany).not.toHaveBeenCalled();
  });

  it('input inválido → error de parámetros, sin tocar BD de citas', async () => {
    const m = makeService();

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      {
        serviceId: SERVICE_ID,
        fecha: '13/07/2026',
      },
    );

    expect(outcome.ok).toBe(false);
    expect(typeof outcome.result.error).toBe('string');
    expect(m.prisma.appointmentFindMany).not.toHaveBeenCalled();
  });

  it('FIX 3: serviceId con forma no-UUID → error legible ANTES de cualquier query', async () => {
    const m = makeService();

    const outcome = await m.service.execute(
      CONTEXT,
      'consultar_disponibilidad',
      { serviceId: '4', fecha: MONDAY },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('serviceId inválido');
    expect(m.prisma.businessFindFirst).not.toHaveBeenCalled();
    expect(m.prisma.serviceFindFirst).not.toHaveBeenCalled();
    expect(m.prisma.appointmentFindMany).not.toHaveBeenCalled();
  });
});

describe('BotToolsService — crear_cita', () => {
  const INPUT = {
    serviceId: SERVICE_ID,
    fechaHora: `${MONDAY}T10:00`,
    nombreCliente: 'Ana',
  };

  it('cliente ya vinculado a la conversación: no crea Client y crea la cita como WHATSAPP sin usuario', async () => {
    const m = makeService();
    m.prisma.conversationFindFirst.mockResolvedValue({
      clientId: CLIENT_ID,
      phone: PHONE,
    });
    m.prisma.clientFindFirst.mockResolvedValue({ id: CLIENT_ID, name: 'Ana' });

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', INPUT);

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      creada: true,
      cita: {
        servicio: 'Cesta de fruta',
        fecha: MONDAY,
        hora: '10:00',
        nombreCliente: 'Ana',
      },
    });
    expect(m.clientsCreate).not.toHaveBeenCalled();

    // Reutiliza AppointmentsService.create: businessId del contexto, sin
    // usuario (null), source WHATSAPP, startsAt como instante con offset
    // (10:00 Madrid julio = 08:00Z).
    const createArgs = m.appointmentsCreate.mock.calls[0] as [
      string,
      string | null,
      { clientId: string; serviceId: string; startsAt: string },
      AppointmentSource,
    ];
    expect(createArgs[0]).toBe(BUSINESS_ID);
    expect(createArgs[1]).toBeNull();
    expect(createArgs[2].clientId).toBe(CLIENT_ID);
    expect(createArgs[2].serviceId).toBe(SERVICE_ID);
    expect(createArgs[2].startsAt).toContain('08:00:00');
    expect(createArgs[3]).toBe(AppointmentSource.WHATSAPP);
  });

  it('fix 4: nombre de tercero (difiere del Client resuelto) → nota "Reserva a nombre de" en la cita', async () => {
    const m = makeService();
    m.prisma.conversationFindFirst.mockResolvedValue({
      clientId: CLIENT_ID,
      phone: PHONE,
    });
    m.prisma.clientFindFirst.mockResolvedValue({
      id: CLIENT_ID,
      name: 'javier',
    });

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      nombreCliente: 'Iván',
    });

    expect(outcome.ok).toBe(true);
    const createArgs = m.appointmentsCreate.mock.calls[0] as [
      string,
      string | null,
      { notes?: string },
    ];
    expect(createArgs[2].notes).toBe(
      'Reserva a nombre de: Iván (vía WhatsApp)',
    );
    // La confirmación al cliente usa el nombre dado en conversación.
    expect(
      (outcome.result.cita as { nombreCliente: string }).nombreCliente,
    ).toBe('Iván');
  });

  it('fix 4: mismo nombre (comparación laxa: trim + mayúsculas) → sin nota', async () => {
    const m = makeService();
    m.prisma.conversationFindFirst.mockResolvedValue({
      clientId: CLIENT_ID,
      phone: PHONE,
    });
    m.prisma.clientFindFirst.mockResolvedValue({
      id: CLIENT_ID,
      name: ' iván ',
    });

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      nombreCliente: 'Iván',
    });

    expect(outcome.ok).toBe(true);
    const createArgs = m.appointmentsCreate.mock.calls[0] as [
      string,
      string | null,
      { notes?: string },
    ];
    expect(createArgs[2].notes).toBeUndefined();
  });

  it('cliente desconocido: crea Client mínimo (nombre + phone E.164) y vincula la conversación', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', INPUT);

    expect(outcome.ok).toBe(true);
    expect(m.clientsCreate).toHaveBeenCalledWith(BUSINESS_ID, {
      name: 'Ana',
      phone: PHONE,
    });
    expect(m.prisma.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, businessId: BUSINESS_ID },
      data: { clientId: CLIENT_ID },
    });
  });

  it('carrera del hueco ocupado (ConflictException): error limpio, legible y SIN cita creada', async () => {
    const m = makeService();
    m.appointmentsCreate.mockRejectedValue(
      new ConflictException('Appointment overlaps an existing one'),
    );

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', INPUT);

    expect(outcome.ok).toBe(false);
    // La transacción de AppointmentsService revierte: la única vía de
    // creación es create(), que ha fallado → cero Appointment.
    expect(m.appointmentsCreate).toHaveBeenCalledTimes(1);
    const error = outcome.result.error as string;
    expect(error).toContain('acaba de ocuparse');
    expect(error).toContain('Consulta la disponibilidad de nuevo');
    // Legible por el modelo: sin restos de excepción ni stack trace.
    expect(error).not.toMatch(/ConflictException|Error:|\n\s+at /);
  });

  it('validación de negocio H1 (BadRequestException) → error controlado sin stack', async () => {
    const m = makeService();
    m.appointmentsCreate.mockRejectedValue(
      new BadRequestException('startsAt must be in the future'),
    );

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', INPUT);

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toBe(
      'No se pudo crear la cita: startsAt must be in the future.',
    );
  });

  it('input inválido (fechaHora mal formada) → error de parámetros sin llegar a crear nada', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: '13/07 a las 10',
    });

    expect(outcome.ok).toBe(false);
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
    expect(m.clientsCreate).not.toHaveBeenCalled();
  });

  it('fix reloj: fechaHora en el pasado (hora ya transcurrida) → error "ya pasó" sin crear, guard antes de resolver/crear', async () => {
    const m = makeService();
    const pasado = DateTime.now()
      .setZone('Europe/Madrid')
      .minus({ hours: 1 })
      .toFormat("yyyy-MM-dd'T'HH:mm");

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: pasado,
    });

    expect(outcome.ok).toBe(false);
    const error = outcome.result.error as string;
    expect(error).toContain('ya pasó');
    expect(error).toContain('ahora son las');
    // El guard corta antes de resolver/crear cliente y antes de la transacción.
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
    expect(m.clientsCreate).not.toHaveBeenCalled();
  });

  it('fix reloj: fechaHora futura del mismo día ("hoy más tarde") pasa el guard y crea', async () => {
    const m = makeService();
    // Sin horario configurado: aísla este test del guard de horario (su
    // intención es el guard del RELOJ; "now+1h" caería en cualquier día/hora).
    m.prisma.businessFindFirst.mockResolvedValue({
      timezone: 'Europe/Madrid',
      weeklySchedule: null,
    });
    const masTarde = DateTime.now()
      .setZone('Europe/Madrid')
      .plus({ hours: 1 })
      .toFormat("yyyy-MM-dd'T'HH:mm");

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: masTarde,
    });

    expect(outcome.ok).toBe(true);
    expect(m.appointmentsCreate).toHaveBeenCalledTimes(1);
  });

  it('guard horario: cita en domingo (día cerrado) → error con el resumen, sin crear ni resolver cliente', async () => {
    const m = makeService();
    // 2026-07-12 es domingo; el schedule del mock (mon 09:00-14:00) no lo abre.
    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: '2026-07-12T10:00',
    });

    expect(outcome.ok).toBe(false);
    const error = outcome.result.error as string;
    expect(error).toContain('horario:');
    expect(error).toContain('Consulta la disponibilidad');
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
    expect(m.clientsCreate).not.toHaveBeenCalled();
  });

  it('guard horario: cita a las 22:00 (fuera de la franja del día) → error, sin crear', async () => {
    const m = makeService();
    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: `${MONDAY}T22:00`,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('horario:');
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
    expect(m.clientsCreate).not.toHaveBeenCalled();
  });

  it('guard horario: cita a las 15:00 en el hueco entre franjas → error, sin crear', async () => {
    const m = makeService();
    m.prisma.businessFindFirst.mockResolvedValue({
      timezone: 'Europe/Madrid',
      weeklySchedule: {
        mon: [
          { start: '09:00', end: '14:00' },
          { start: '16:00', end: '20:00' },
        ],
      },
    });

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: `${MONDAY}T15:00`,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('horario:');
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
  });

  it('guard horario: el caso clave — la cita DESBORDA el cierre (13:45 + 30 min, cierre 14:00) → error, sin crear', async () => {
    const m = makeService();
    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: `${MONDAY}T13:45`,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('horario:');
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
  });

  it('guard horario: la cita cabe justo hasta el cierre (13:30 + 30 min = 14:00) → crea', async () => {
    const m = makeService();
    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: `${MONDAY}T13:30`,
    });

    expect(outcome.ok).toBe(true);
    expect(m.appointmentsCreate).toHaveBeenCalledTimes(1);
  });

  it('guard horario: cita a las 10:00 de un laborable dentro de franja → crea', async () => {
    const m = makeService();
    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      fechaHora: `${MONDAY}T10:00`,
    });

    expect(outcome.ok).toBe(true);
    expect(m.appointmentsCreate).toHaveBeenCalledTimes(1);
  });

  it('guard horario: sin weeklySchedule configurado → no bloquea, crea (comportamiento actual)', async () => {
    const m = makeService();
    m.prisma.businessFindFirst.mockResolvedValue({
      timezone: 'Europe/Madrid',
      weeklySchedule: null,
    });

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      // 22:00: fuera de cualquier horario razonable, pero sin schedule no se
      // valida — el guard solo actúa con horario configurado.
      fechaHora: `${MONDAY}T22:00`,
    });

    expect(outcome.ok).toBe(true);
    expect(m.appointmentsCreate).toHaveBeenCalledTimes(1);
  });

  it('FIX 3: serviceId con forma no-UUID → error legible ANTES de cualquier query', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', {
      ...INPUT,
      serviceId: '4',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('serviceId inválido');
    expect(m.prisma.businessFindFirst).not.toHaveBeenCalled();
    expect(m.appointmentsCreate).not.toHaveBeenCalled();
    expect(m.clientsCreate).not.toHaveBeenCalled();
  });

  it('fallo inesperado → error genérico legible (red de seguridad), nunca lanza', async () => {
    const m = makeService();
    m.appointmentsCreate.mockRejectedValue(new Error('db down'));

    const outcome = await m.service.execute(CONTEXT, 'crear_cita', INPUT);

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toBe(
      'No he podido completar la operación por un error interno.',
    );
  });

  it('herramienta desconocida → error de negocio', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'inventada', {});

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('Herramienta desconocida');
  });
});

const APPOINTMENT_ID = 'a0000000-0000-0000-0000-000000000099';

describe('BotToolsService — listar_mis_citas (T6, identidad por teléfono)', () => {
  it('devuelve las citas del cliente del teléfono con fecha/hora locales, diaSemana y filtros completos', async () => {
    const m = makeService();
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
    m.prisma.appointmentFindMany.mockResolvedValue([
      {
        id: APPOINTMENT_ID,
        // 10:00 local Madrid en julio (UTC+2) del lunes 13.
        startsAt: new Date(`${MONDAY}T08:00:00Z`),
        notes: null,
        service: { name: 'Cesta de fruta' },
      },
    ]);

    const outcome = await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      citas: [
        {
          appointmentId: APPOINTMENT_ID,
          servicio: 'Cesta de fruta',
          fecha: MONDAY,
          hora: '10:00',
          diaSemana: 'lunes',
        },
      ],
      hayMas: false,
      // FIX 2: instrucción en el punto de uso (el modelo mandó el ordinal).
      aviso:
        'Para cancelar_cita usa el appointmentId EXACTO (UUID completo), nunca el número de orden.',
    });

    // La identidad sale del teléfono de la conversación (multi-tenant).
    expect(m.prisma.clientFindMany).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID, phone: PHONE, deletedAt: null },
      select: { id: true },
    });
    // La query de citas lleva TODOS los filtros: negocio, clientes del
    // teléfono, activas, no borradas y futuras.
    const where = (
      m.prisma.appointmentFindMany.mock.calls[0] as [
        {
          where: {
            businessId: string;
            clientId: { in: string[] };
            status: { in: string[] };
            deletedAt: null;
            startsAt: { gt: Date };
          };
        },
      ]
    )[0].where;
    expect(where.businessId).toBe(BUSINESS_ID);
    expect(where.clientId.in).toEqual([CLIENT_ID]);
    expect(where.status.in).toEqual(['SCHEDULED', 'CONFIRMED']);
    expect(where.deletedAt).toBeNull();
    expect(where.startsAt.gt).toBeInstanceOf(Date);
  });

  it('una cita de OTRO cliente del mismo negocio no entra: el filtro clientId.in solo lleva los ids del teléfono', async () => {
    const m = makeService();
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);

    await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    const where = (
      m.prisma.appointmentFindMany.mock.calls[0] as [
        { where: { clientId: { in: string[] } } },
      ]
    )[0].where;
    // Un Client ajeno (otro teléfono) jamás aparece en el in: la BD no puede
    // devolver sus citas.
    expect(where.clientId.in).toEqual([CLIENT_ID]);
  });

  it('suma el clientId ya vinculado a la conversación (si sigue activo) a los ids del teléfono', async () => {
    const m = makeService();
    const linkedId = 'cl000000-0000-0000-0000-000000000002';
    m.prisma.conversationFindFirst.mockResolvedValue({
      clientId: linkedId,
      phone: PHONE,
    });
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
    m.prisma.clientFindFirst.mockResolvedValue({ id: linkedId });

    await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    const where = (
      m.prisma.appointmentFindMany.mock.calls[0] as [
        { where: { clientId: { in: string[] } } },
      ]
    )[0].where;
    expect(where.clientId.in).toEqual(
      expect.arrayContaining([CLIENT_ID, linkedId]),
    );
    // La verificación del vinculado va filtrada por businessId.
    const linkedWhere = (
      m.prisma.clientFindFirst.mock.calls[0] as [
        { where: { id: string; businessId: string } },
      ]
    )[0].where;
    expect(linkedWhere.businessId).toBe(BUSINESS_ID);
  });

  it('extrae "a nombre de" de la nota de tercero de T5', async () => {
    const m = makeService();
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
    m.prisma.appointmentFindMany.mockResolvedValue([
      {
        id: APPOINTMENT_ID,
        startsAt: new Date(`${MONDAY}T08:00:00Z`),
        notes: 'Reserva a nombre de: Iván (vía WhatsApp)',
        service: { name: 'Cesta de fruta' },
      },
    ]);

    const outcome = await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    const citas = outcome.result.citas as Array<{ aNombreDe?: string }>;
    expect(citas[0].aNombreDe).toBe('Iván');
  });

  it('tope de 5 citas para el modelo, con hayMas', async () => {
    const m = makeService();
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
    m.prisma.appointmentFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `a-${i}`,
        startsAt: new Date(Date.UTC(2026, 6, 13, 8, i * 10)),
        notes: null,
        service: { name: 'Cesta de fruta' },
      })),
    );

    const outcome = await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    expect((outcome.result.citas as unknown[]).length).toBe(5);
    expect(outcome.result.hayMas).toBe(true);
  });

  it('teléfono sin Client → lista vacía con motivo, sin tocar la tabla de citas', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'listar_mis_citas', {});

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({
      citas: [],
      motivo: 'No hay citas futuras activas para este teléfono.',
    });
    expect(m.prisma.appointmentFindMany).not.toHaveBeenCalled();
  });
});

describe('BotToolsService — cancelar_cita (T6)', () => {
  const CANCEL_ERROR =
    'No encuentro esa cita entre las citas futuras activas de este teléfono.';

  function withOwnAppointment(m: Mocks) {
    m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
    m.prisma.appointmentFindFirst.mockResolvedValue({
      id: APPOINTMENT_ID,
      startsAt: new Date(`${MONDAY}T08:00:00Z`),
      service: { name: 'Cesta de fruta' },
    });
  }

  it('feliz: verifica identidad + futura + activa y reutiliza AppointmentsService.cancel (soft, con reason)', async () => {
    const m = makeService();
    withOwnAppointment(m);

    const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {
      appointmentId: APPOINTMENT_ID,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      cancelada: true,
      cita: { servicio: 'Cesta de fruta', fecha: MONDAY, hora: '10:00' },
    });
    expect(m.appointmentsCancel).toHaveBeenCalledWith(
      BUSINESS_ID,
      APPOINTMENT_ID,
      { reason: 'Cancelada por el cliente vía WhatsApp' },
    );

    // Defensa dura ANTES de cancelar: id + businessId + cliente del teléfono
    // + activa + no borrada + futura.
    const where = (
      m.prisma.appointmentFindFirst.mock.calls[0] as [
        {
          where: {
            id: string;
            businessId: string;
            clientId: { in: string[] };
            status: { in: string[] };
            deletedAt: null;
            startsAt: { gt: Date };
          };
        },
      ]
    )[0].where;
    expect(where.id).toBe(APPOINTMENT_ID);
    expect(where.businessId).toBe(BUSINESS_ID);
    expect(where.clientId.in).toEqual([CLIENT_ID]);
    expect(where.status.in).toEqual(['SCHEDULED', 'CONFIRMED']);
    expect(where.deletedAt).toBeNull();
    expect(where.startsAt.gt).toBeInstanceOf(Date);
  });

  it('cita ajena / pasada / inactiva / de otro negocio → el MISMO error byte a byte, sin cancelar nada', async () => {
    // Los cuatro casos caen en el mismo findFirst filtrado → null. Se
    // ejecutan las cuatro invocaciones y se comprueba que el texto es
    // idéntico (nada filtra CUÁL fue el motivo). El id es UUID-shape válido:
    // pasa la validación de forma del FIX 3 y cae en la query.
    const errors: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = makeService();
      m.prisma.clientFindMany.mockResolvedValue([{ id: CLIENT_ID }]);
      m.prisma.appointmentFindFirst.mockResolvedValue(null);

      const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {
        appointmentId: APPOINTMENT_ID,
      });

      expect(outcome.ok).toBe(false);
      expect(m.appointmentsCancel).not.toHaveBeenCalled();
      errors.push(outcome.result.error as string);
    }

    expect(new Set(errors).size).toBe(1);
    expect(errors[0]).toBe(CANCEL_ERROR);
  });

  it('FIX 3: appointmentId con forma no-UUID (el ordinal "4" del log) → error legible ANTES de cualquier query', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {
      appointmentId: '4',
    });

    expect(outcome.ok).toBe(false);
    const error = outcome.result.error as string;
    expect(error).toContain('appointmentId inválido');
    expect(error).toContain('listar_mis_citas');
    // Ni identidad, ni cita, ni cancelación: cero queries (nada de P2023).
    expect(m.prisma.conversationFindFirst).not.toHaveBeenCalled();
    expect(m.prisma.clientFindMany).not.toHaveBeenCalled();
    expect(m.prisma.appointmentFindFirst).not.toHaveBeenCalled();
    expect(m.appointmentsCancel).not.toHaveBeenCalled();
  });

  it('teléfono sin Client → mismo error indistinguible, sin ni siquiera consultar citas', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {
      appointmentId: APPOINTMENT_ID,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toBe(CANCEL_ERROR);
    expect(m.prisma.appointmentFindFirst).not.toHaveBeenCalled();
    expect(m.appointmentsCancel).not.toHaveBeenCalled();
  });

  it('carrera (la cita cambió entre verificación y cancelación) → error legible sin stack', async () => {
    const m = makeService();
    withOwnAppointment(m);
    m.appointmentsCancel.mockRejectedValue(
      new ConflictException('Appointment is in a terminal state'),
    );

    const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {
      appointmentId: APPOINTMENT_ID,
    });

    expect(outcome.ok).toBe(false);
    const error = outcome.result.error as string;
    expect(error).toContain('acaba de cambiar');
    expect(error).not.toMatch(/ConflictException|Error:|\n\s+at /);
  });

  it('input inválido → error de parámetros, sin tocar nada', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'cancelar_cita', {});

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('appointmentId');
    expect(m.prisma.appointmentFindFirst).not.toHaveBeenCalled();
    expect(m.appointmentsCancel).not.toHaveBeenCalled();
  });
});

describe('BotToolsService — escalar_a_humano (T6)', () => {
  it('motivo válido → updateMany con id + businessId a PENDING_REVIEW y eco al modelo', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'escalar_a_humano', {
      motivo: 'PIDE_HUMANO',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({ escalado: true, motivo: 'PIDE_HUMANO' });
    expect(m.prisma.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, businessId: BUSINESS_ID },
      data: { status: ConversationStatus.PENDING_REVIEW },
    });
  });

  it('motivo fuera del enum → error de parámetros, sin tocar la conversación', async () => {
    const m = makeService();

    const outcome = await m.service.execute(CONTEXT, 'escalar_a_humano', {
      motivo: 'ME_ABURRO',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toContain('motivo debe ser uno de');
    expect(m.prisma.conversationUpdateMany).not.toHaveBeenCalled();
  });

  it('conversación no encontrada (count 0) → error de negocio', async () => {
    const m = makeService();
    m.prisma.conversationUpdateMany.mockResolvedValue({ count: 0 });

    const outcome = await m.service.execute(CONTEXT, 'escalar_a_humano', {
      motivo: 'URGENCIA',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result.error).toBe('Conversación no disponible.');
  });
});

describe('BotToolsService — transitionToPendingReview (única escritura de status desde el bot)', () => {
  it('actualiza con id + businessId y devuelve true', async () => {
    const m = makeService();

    await expect(m.service.transitionToPendingReview(CONTEXT)).resolves.toBe(
      true,
    );
    expect(m.prisma.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, businessId: BUSINESS_ID },
      data: { status: ConversationStatus.PENDING_REVIEW },
    });
  });

  it('nunca lanza: un fallo de BD devuelve false (el fallback sale igualmente)', async () => {
    const m = makeService();
    m.prisma.conversationUpdateMany.mockRejectedValue(new Error('db down'));

    await expect(m.service.transitionToPendingReview(CONTEXT)).resolves.toBe(
      false,
    );
  });
});
