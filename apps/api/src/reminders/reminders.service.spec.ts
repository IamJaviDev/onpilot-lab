import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { RemindersService } from './reminders.service';

// Tests del scheduler de recordatorios (H2 T7). Lo que se protege: jobId
// determinista y delay correcto, el "no programar si el lead ya pasó", el
// flag estricto, el contrato "jamás lanza" (Redis caído ≠ citas rotas), el
// override de antelación para pruebas manuales y el flujo de reprogramación
// T6 (cancel+create) a nivel de jobs.

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const APPOINTMENT_ID = 'a0000000-0000-0000-0000-000000000001';

const HOUR_MS = 60 * 60 * 1000;
const LEAD_24H_MS = 24 * HOUR_MS;

function appointmentIn(ms: number, id = APPOINTMENT_ID) {
  return { id, businessId: BUSINESS_ID, startsAt: new Date(Date.now() + ms) };
}

interface Mocks {
  service: RemindersService;
  add: jest.Mock;
  remove: jest.Mock;
}

function makeService(env: Record<string, string> = {}): Mocks {
  const add = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(1);
  const queue = { add, remove } as unknown as Queue;
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return { service: new RemindersService(queue, config), add, remove };
}

const ENABLED = { REMINDERS_ENABLED: 'true' };

describe('RemindersService.schedule', () => {
  it('cita a +3 días → job con jobId = appointmentId, payload con businessId y delay ≈ (startsAt − 24h − ahora)', async () => {
    const m = makeService(ENABLED);
    const appointment = appointmentIn(3 * 24 * HOUR_MS);

    await m.service.schedule(appointment);

    expect(m.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = m.add.mock.calls[0] as [
      string,
      { businessId: string; appointmentId: string; startsAt: string },
      { jobId: string; delay: number; removeOnComplete: boolean },
    ];
    expect(name).toBe('reminder');
    expect(data).toEqual({
      businessId: BUSINESS_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt: appointment.startsAt.toISOString(),
    });
    expect(opts.jobId).toBe(APPOINTMENT_ID);
    expect(opts.removeOnComplete).toBe(true);
    const expectedDelay = 3 * 24 * HOUR_MS - LEAD_24H_MS;
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5_000);
    expect(opts.delay).toBeLessThanOrEqual(expectedDelay);
  });

  it('cita a menos de 24h (el lead ya pasó) → NO se programa nada', async () => {
    const m = makeService(ENABLED);
    await m.service.schedule(appointmentIn(2 * HOUR_MS));
    expect(m.add).not.toHaveBeenCalled();
  });

  it.each(['false', 'TRUE', '1', undefined])(
    'flag estricto: REMINDERS_ENABLED=%p → no-op',
    async (value) => {
      const m = makeService(
        value === undefined ? {} : { REMINDERS_ENABLED: value },
      );
      await m.service.schedule(appointmentIn(3 * 24 * HOUR_MS));
      expect(m.add).not.toHaveBeenCalled();
    },
  );

  it('Redis caído (add rechaza) → resuelve sin lanzar (la cita no se ve afectada)', async () => {
    const m = makeService(ENABLED);
    m.add.mockRejectedValue(new Error('connection refused'));
    await expect(
      m.service.schedule(appointmentIn(3 * 24 * HOUR_MS)),
    ).resolves.toBeUndefined();
  });

  it('REMINDERS_LEAD_MINUTES=5 (prueba manual) → cita a +10 min se programa con delay ≈ 5 min', async () => {
    const m = makeService({ ...ENABLED, REMINDERS_LEAD_MINUTES: '5' });
    await m.service.schedule(appointmentIn(10 * 60_000));

    expect(m.add).toHaveBeenCalledTimes(1);
    const [, , opts] = m.add.mock.calls[0] as [
      string,
      unknown,
      { delay: number },
    ];
    expect(opts.delay).toBeGreaterThan(5 * 60_000 - 5_000);
    expect(opts.delay).toBeLessThanOrEqual(5 * 60_000);
  });

  it('REMINDERS_LEAD_MINUTES inválido → cae a las 24h (cita a +10 min no se programa)', async () => {
    const m = makeService({ ...ENABLED, REMINDERS_LEAD_MINUTES: 'cinco' });
    await m.service.schedule(appointmentIn(10 * 60_000));
    expect(m.add).not.toHaveBeenCalled();
  });
});

describe('RemindersService.cancel', () => {
  it('elimina el job por jobId = appointmentId', async () => {
    const m = makeService(ENABLED);
    await m.service.cancel(APPOINTMENT_ID);
    expect(m.remove).toHaveBeenCalledWith(APPOINTMENT_ID);
  });

  it('flag off → no toca la cola (el processor descartará jobs residuales)', async () => {
    const m = makeService();
    await m.service.cancel(APPOINTMENT_ID);
    expect(m.remove).not.toHaveBeenCalled();
  });

  it('Redis caído (remove rechaza) → resuelve sin lanzar (la cancelación no se ve afectada)', async () => {
    const m = makeService(ENABLED);
    m.remove.mockRejectedValue(new Error('connection refused'));
    await expect(m.service.cancel(APPOINTMENT_ID)).resolves.toBeUndefined();
  });
});

describe('RemindersService.reschedule', () => {
  it('remove + add con el nuevo delay', async () => {
    const m = makeService(ENABLED);
    const appointment = appointmentIn(5 * 24 * HOUR_MS);

    await m.service.reschedule(appointment);

    expect(m.remove).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(m.add).toHaveBeenCalledTimes(1);
    const removeOrder = m.remove.mock.invocationCallOrder[0];
    const addOrder = m.add.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(addOrder);
  });

  it('nueva fecha a menos del lead → elimina el job viejo y NO programa otro', async () => {
    const m = makeService(ENABLED);
    await m.service.reschedule(appointmentIn(2 * HOUR_MS));
    expect(m.remove).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(m.add).not.toHaveBeenCalled();
  });
});

describe('Flujo de reprogramación T6 (cancel + create) a nivel de jobs', () => {
  // Cola fake CON ESTADO: lo que importa del flujo no es qué métodos se
  // llamaron, sino qué jobs QUEDAN en Redis al final.
  function makeStatefulQueue() {
    const jobs = new Map<string, { data: unknown; delay: number }>();
    const queue = {
      add: jest
        .fn()
        .mockImplementation(
          (
            _name: string,
            data: unknown,
            opts: { jobId: string; delay: number },
          ) => {
            jobs.set(opts.jobId, { data, delay: opts.delay });
            return Promise.resolve(undefined);
          },
        ),
      remove: jest.fn().mockImplementation((jobId: string) => {
        const existed = jobs.delete(jobId);
        return Promise.resolve(existed ? 1 : 0);
      }),
    } as unknown as Queue;
    return { queue, jobs };
  }

  it('tras cancel(vieja) + schedule(nueva) queda EXACTAMENTE un job: el de la cita nueva', async () => {
    const { queue, jobs } = makeStatefulQueue();
    const config = {
      get: (key: string) => (key === 'REMINDERS_ENABLED' ? 'true' : undefined),
    } as unknown as ConfigService;
    const service = new RemindersService(queue, config);

    const oldId = 'a0000000-0000-0000-0000-00000000000a';
    const newId = 'a0000000-0000-0000-0000-00000000000b';

    // La cita original existe con su recordatorio programado…
    await service.schedule(appointmentIn(3 * 24 * HOUR_MS, oldId));
    expect(jobs.size).toBe(1);

    // …y el bot de T6 reprograma: AppointmentsService.cancel(vieja) +
    // AppointmentsService.create(nueva) disparan estos dos ganchos.
    await service.cancel(oldId);
    await service.schedule(appointmentIn(5 * 24 * HOUR_MS, newId));

    expect(jobs.size).toBe(1);
    expect(jobs.has(newId)).toBe(true);
    expect(jobs.has(oldId)).toBe(false);
  });
});
