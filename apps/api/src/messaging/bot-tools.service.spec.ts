import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { ClientsService } from '../clients/clients.service';
import { AppointmentSource } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BotToolsService } from './bot-tools.service';

// Tests de la ejecución server-side de las tools (T5). Lo que se protege:
// multi-tenancy en cada query (businessId del contexto, jamás del modelo),
// resolución de cliente (vinculado / por teléfono / creación mínima), la
// carrera del hueco ocupado → error limpio SIN cita creada y legible por el
// modelo (sin stack), y errores de negocio nunca lanzados.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';
const SERVICE_ID = 's0000000-0000-0000-0000-000000000001';
const CLIENT_ID = 'cl000000-0000-0000-0000-000000000001';
const PHONE = '+34600000001';

const CONTEXT = { businessId: BUSINESS_ID, conversationId: CONVERSATION_ID };

// 2026-07-13 es lunes, futuro respecto a los tests.
const MONDAY = '2026-07-13';

interface Mocks {
  service: BotToolsService;
  prisma: {
    businessFindFirst: jest.Mock;
    serviceFindFirst: jest.Mock;
    appointmentFindMany: jest.Mock;
    conversationFindFirst: jest.Mock;
    conversationUpdateMany: jest.Mock;
    clientFindFirst: jest.Mock;
  };
  appointmentsCreate: jest.Mock;
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
    conversationFindFirst: jest
      .fn()
      .mockResolvedValue({ clientId: null, phone: PHONE }),
    conversationUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    clientFindFirst: jest.fn().mockResolvedValue(null),
  };

  const prisma = {
    business: { findFirst: prismaMocks.businessFindFirst },
    service: { findFirst: prismaMocks.serviceFindFirst },
    appointment: { findMany: prismaMocks.appointmentFindMany },
    conversation: {
      findFirst: prismaMocks.conversationFindFirst,
      updateMany: prismaMocks.conversationUpdateMany,
    },
    client: { findFirst: prismaMocks.clientFindFirst },
  } as unknown as PrismaService;

  const appointmentsCreate = jest.fn().mockResolvedValue({
    id: 'a0000000-0000-0000-0000-000000000001',
    client: { id: CLIENT_ID, name: 'Ana', phone: PHONE },
    service: { id: SERVICE_ID, name: 'Cesta de fruta', basePrice: 25 },
    // 10:00 local Madrid en julio (UTC+2).
    startsAt: new Date(`${MONDAY}T08:00:00Z`),
    endsAt: new Date(`${MONDAY}T08:30:00Z`),
  });
  const appointments = {
    create: appointmentsCreate,
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
        serviceId: 'ajeno',
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
