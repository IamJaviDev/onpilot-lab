import { ConflictException } from '@nestjs/common';
import { AppointmentSource } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RemindersService } from '../reminders/reminders.service';
import { AppointmentsService } from './appointments.service';

// Tests del refactor mínimo de H2 T5 sobre create(): createdById nullable y
// source parametrizado. Lo que se protege: la llamada de la web (user.id, sin
// source) sigue creando MANUAL exactamente igual, el bot puede crear
// WHATSAPP sin usuario, y la protección de solape en transacción no crea
// nada si el hueco está ocupado.
//
// H2 T7 añade los ganchos de recordatorio: crear programa, cancelar elimina,
// editar la fecha reprograma — y SOLO si la fecha cambia de verdad.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const USER_ID = 'u0000000-0000-0000-0000-000000000001';
const CLIENT_ID = 'cl000000-0000-0000-0000-000000000001';
const SERVICE_ID = 's0000000-0000-0000-0000-000000000001';
const APPOINTMENT_ID = 'a0000000-0000-0000-0000-000000000001';

// Fecha actual de la cita en BD para los tests de update/cancel (futura).
const CURRENT_STARTS_AT = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

// Mañana a las 10:00 UTC (siempre futuro para assertNotPast).
function futureStartsAt(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

// Fila completa: sirve al select de requireEditable y al include de getOne.
function appointmentRow() {
  return {
    id: APPOINTMENT_ID,
    serviceId: SERVICE_ID,
    startsAt: CURRENT_STARTS_AT,
    endsAt: new Date(CURRENT_STARTS_AT.getTime() + 30 * 60_000),
    status: 'CONFIRMED',
    source: AppointmentSource.MANUAL,
    client: { id: CLIENT_ID, name: 'Ana', phone: '+34600000001' },
    service: { id: SERVICE_ID, name: 'Cesta de fruta', basePrice: 25 },
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
  };
}

interface Mocks {
  service: AppointmentsService;
  txCreate: jest.Mock;
  txOverlapFindFirst: jest.Mock;
  txUpdateMany: jest.Mock;
  reminders: {
    schedule: jest.Mock;
    cancel: jest.Mock;
    reschedule: jest.Mock;
  };
}

function makeService(): Mocks {
  const txOverlapFindFirst = jest.fn().mockResolvedValue(null);
  const txUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const txCreate = jest.fn().mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({
      id: APPOINTMENT_ID,
      ...data,
      client: { id: CLIENT_ID, name: 'Ana', phone: '+34600000001' },
      service: { id: SERVICE_ID, name: 'Cesta de fruta', basePrice: 25 },
      startsAt: new Date(),
      endsAt: new Date(),
      status: 'CONFIRMED',
      notes: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
    }),
  );

  const prisma = {
    client: {
      findFirst: jest.fn().mockResolvedValue({ id: CLIENT_ID }),
    },
    service: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: SERVICE_ID, durationMinutes: 30 }),
    },
    appointment: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve(appointmentRow())),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        fn({
          appointment: {
            findFirst: txOverlapFindFirst,
            create: txCreate,
            updateMany: txUpdateMany,
          },
        }),
    ),
  } as unknown as PrismaService;

  const reminders = {
    schedule: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    reschedule: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new AppointmentsService(
      prisma,
      reminders as unknown as RemindersService,
    ),
    txCreate,
    txOverlapFindFirst,
    txUpdateMany,
    reminders,
  };
}

describe('AppointmentsService.create — refactor T5', () => {
  const dto = () => ({
    clientId: CLIENT_ID,
    serviceId: SERVICE_ID,
    startsAt: futureStartsAt(),
  });

  it('llamada de la web (user.id, sin source) → createdById del usuario y source MANUAL (sin cambio de comportamiento)', async () => {
    const m = makeService();

    await m.service.create(BUSINESS_ID, USER_ID, dto());

    const [{ data }] = m.txCreate.mock.calls[0] as [
      { data: { createdById: string | null; source: AppointmentSource } },
    ];
    expect(data.createdById).toBe(USER_ID);
    expect(data.source).toBe(AppointmentSource.MANUAL);
  });

  it('llamada del bot (null, WHATSAPP) → cita sin usuario con origen WHATSAPP', async () => {
    const m = makeService();

    await m.service.create(
      BUSINESS_ID,
      null,
      dto(),
      AppointmentSource.WHATSAPP,
    );

    const [{ data }] = m.txCreate.mock.calls[0] as [
      { data: { createdById: string | null; source: AppointmentSource } },
    ];
    expect(data.createdById).toBeNull();
    expect(data.source).toBe(AppointmentSource.WHATSAPP);
  });

  it('hueco ocupado → ConflictException dentro de la transacción y NO se crea nada (ni recordatorio)', async () => {
    const m = makeService();
    m.txOverlapFindFirst.mockResolvedValue({ id: 'otra-cita' });

    await expect(
      m.service.create(BUSINESS_ID, null, dto(), AppointmentSource.WHATSAPP),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(m.txCreate).not.toHaveBeenCalled();
    expect(m.reminders.schedule).not.toHaveBeenCalled();
  });
});

describe('AppointmentsService — ganchos de recordatorio (H2 T7)', () => {
  it('create → programa el recordatorio con {id, businessId, startsAt} tras la transacción', async () => {
    const m = makeService();

    await m.service.create(BUSINESS_ID, USER_ID, {
      clientId: CLIENT_ID,
      serviceId: SERVICE_ID,
      startsAt: futureStartsAt(),
    });

    expect(m.reminders.schedule).toHaveBeenCalledTimes(1);
    const [arg] = m.reminders.schedule.mock.calls[0] as [
      { id: string; businessId: string; startsAt: Date },
    ];
    expect(arg.id).toBe(APPOINTMENT_ID);
    expect(arg.businessId).toBe(BUSINESS_ID);
    expect(arg.startsAt).toBeInstanceOf(Date);
  });

  it('cancel → elimina el job del recordatorio', async () => {
    const m = makeService();

    await m.service.cancel(BUSINESS_ID, APPOINTMENT_ID, {});

    expect(m.reminders.cancel).toHaveBeenCalledWith(APPOINTMENT_ID);
  });

  it('update con startsAt NUEVO → reprograma con la nueva fecha', async () => {
    const m = makeService();
    const newStartsAt = futureStartsAt();

    await m.service.update(BUSINESS_ID, APPOINTMENT_ID, {
      startsAt: newStartsAt,
    });

    expect(m.reminders.reschedule).toHaveBeenCalledTimes(1);
    const [arg] = m.reminders.reschedule.mock.calls[0] as [
      { id: string; businessId: string; startsAt: Date },
    ];
    expect(arg.id).toBe(APPOINTMENT_ID);
    expect(arg.businessId).toBe(BUSINESS_ID);
    expect(arg.startsAt.toISOString()).toBe(newStartsAt);
  });

  it('update con startsAt IGUAL al actual → NO reprograma (sin remove+add innecesario)', async () => {
    const m = makeService();

    await m.service.update(BUSINESS_ID, APPOINTMENT_ID, {
      startsAt: CURRENT_STARTS_AT.toISOString(),
    });

    expect(m.reminders.reschedule).not.toHaveBeenCalled();
  });

  it('update solo de notas → NO reprograma', async () => {
    const m = makeService();

    await m.service.update(BUSINESS_ID, APPOINTMENT_ID, {
      notes: 'trae la tarjeta regalo',
    });

    expect(m.reminders.reschedule).not.toHaveBeenCalled();
  });
});
