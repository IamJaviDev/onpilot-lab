import { ConflictException } from '@nestjs/common';
import { AppointmentSource } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

// Tests del refactor mínimo de H2 T5 sobre create(): createdById nullable y
// source parametrizado. Lo que se protege: la llamada de la web (user.id, sin
// source) sigue creando MANUAL exactamente igual, el bot puede crear
// WHATSAPP sin usuario, y la protección de solape en transacción no crea
// nada si el hueco está ocupado.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const USER_ID = 'u0000000-0000-0000-0000-000000000001';
const CLIENT_ID = 'cl000000-0000-0000-0000-000000000001';
const SERVICE_ID = 's0000000-0000-0000-0000-000000000001';

// Mañana a las 10:00 UTC (siempre futuro para assertNotPast).
function futureStartsAt(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

interface Mocks {
  service: AppointmentsService;
  txCreate: jest.Mock;
  txOverlapFindFirst: jest.Mock;
}

function makeService(): Mocks {
  const txOverlapFindFirst = jest.fn().mockResolvedValue(null);
  const txCreate = jest.fn().mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({
      id: 'a0000000-0000-0000-0000-000000000001',
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
    $transaction: jest.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        fn({
          appointment: { findFirst: txOverlapFindFirst, create: txCreate },
        }),
    ),
  } as unknown as PrismaService;

  return {
    service: new AppointmentsService(prisma),
    txCreate,
    txOverlapFindFirst,
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

  it('hueco ocupado → ConflictException dentro de la transacción y NO se crea nada', async () => {
    const m = makeService();
    m.txOverlapFindFirst.mockResolvedValue({ id: 'otra-cita' });

    await expect(
      m.service.create(BUSINESS_ID, null, dto(), AppointmentSource.WHATSAPP),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(m.txCreate).not.toHaveBeenCalled();
  });
});
