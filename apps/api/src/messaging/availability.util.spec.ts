import { DateTime } from 'luxon';
import {
  buildUpcomingWeekCalendar,
  computeFreeSlots,
  fitsWithinOpenInterval,
  formatScheduleSummary,
  parseWeeklySchedule,
  type ComputeFreeSlotsInput,
  type WeeklySchedule,
} from './availability.util';

// Tests del cálculo puro de disponibilidad (T5). Todo se comprueba en
// Europe/Madrid en julio (UTC+2): las citas se pasan como instantes UTC y los
// slots esperados van en hora local — si algún paso del cálculo usara UTC en
// vez de la timezone del negocio, estos tests fallarían con 2h de desfase.

// 2026-07-13 es lunes; "ahora" es 2026-07-07 (todo el día 13 es futuro).
const MONDAY = '2026-07-13';
const NOW = new Date('2026-07-07T12:00:00Z');

function makeInput(
  overrides: Partial<ComputeFreeSlotsInput> = {},
): ComputeFreeSlotsInput {
  return {
    date: MONDAY,
    timezone: 'Europe/Madrid',
    schedule: { mon: [{ start: '09:00', end: '14:00' }] },
    durationMinutes: 30,
    appointments: [],
    now: NOW,
    ...overrides,
  };
}

// Instante UTC de una hora local Madrid en verano (UTC+2).
function madridUtc(hourLocal: number, minute = 0): Date {
  return new Date(
    `${MONDAY}T${String(hourLocal - 2).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
}

describe('parseWeeklySchedule', () => {
  it('acepta un horario válido con jornada partida', () => {
    expect(
      parseWeeklySchedule({
        mon: [
          { start: '09:00', end: '14:00' },
          { start: '17:00', end: '20:00' },
        ],
        sat: [],
      }),
    ).toEqual({
      mon: [
        { start: '09:00', end: '14:00' },
        { start: '17:00', end: '20:00' },
      ],
      sat: [],
    });
  });

  it.each([
    ['null', null],
    ['string', 'abierto'],
    ['array', []],
    ['clave desconocida', { lunes: [{ start: '09:00', end: '14:00' }] }],
    ['hora mal formada', { mon: [{ start: '9:00', end: '14:00' }] }],
    ['fin <= inicio', { mon: [{ start: '14:00', end: '09:00' }] }],
    ['intervalo no objeto', { mon: ['09:00-14:00'] }],
  ])('rechaza %s → null (como si no hubiera horario)', (_label, value) => {
    expect(parseWeeklySchedule(value)).toBeNull();
  });
});

describe('computeFreeSlots', () => {
  it('día con huecos: rejilla de 30 min dentro del horario, en hora local', () => {
    const result = computeFreeSlots(makeInput());

    expect(result.kind).toBe('open');
    const slots = result.kind === 'open' ? result.slots : [];
    // 09:00..13:30 (el de 13:30 + 30min termina justo a las 14:00).
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe(`${MONDAY}T09:00`);
    expect(slots[1]).toBe(`${MONDAY}T09:30`);
    expect(slots[slots.length - 1]).toBe(`${MONDAY}T13:30`);
  });

  it('día lleno: una cita que cubre todo el horario → sin slots', () => {
    const result = computeFreeSlots(
      makeInput({
        appointments: [{ startsAt: madridUtc(9), endsAt: madridUtc(14) }],
      }),
    );

    expect(result).toEqual({ kind: 'open', slots: [] });
  });

  it('día cerrado (sin intervalos para ese día de la semana) → closed', () => {
    const result = computeFreeSlots(
      makeInput({ schedule: { tue: [{ start: '09:00', end: '14:00' }] } }),
    );

    expect(result).toEqual({ kind: 'closed' });
  });

  it('solape parcial: la cita bloquea solo los slots que intersecta (instantes UTC vs slots locales)', () => {
    // Cita 10:00-11:00 local Madrid, pasada como instante UTC (08:00Z-09:00Z).
    const result = computeFreeSlots(
      makeInput({
        appointments: [{ startsAt: madridUtc(10), endsAt: madridUtc(11) }],
      }),
    );

    const slots = result.kind === 'open' ? result.slots : [];
    // 09:30+30 termina JUSTO a las 10:00 → no solapa. 10:00 y 10:30 fuera.
    expect(slots).toContain(`${MONDAY}T09:30`);
    expect(slots).not.toContain(`${MONDAY}T10:00`);
    expect(slots).not.toContain(`${MONDAY}T10:30`);
    expect(slots).toContain(`${MONDAY}T11:00`);
  });

  it('duración que no cabe al final del intervalo: el slot se descarta', () => {
    const result = computeFreeSlots(
      makeInput({
        schedule: { mon: [{ start: '09:00', end: '10:00' }] },
        durationMinutes: 45,
      }),
    );

    // 09:00+45 = 09:45 cabe; 09:30+45 = 10:15 se pasa.
    expect(result).toEqual({ kind: 'open', slots: [`${MONDAY}T09:00`] });
  });

  it('jornada partida: huecos de mañana y tarde, nada en el descanso', () => {
    const result = computeFreeSlots(
      makeInput({
        schedule: {
          mon: [
            { start: '09:00', end: '10:00' },
            { start: '17:00', end: '18:00' },
          ],
        },
      }),
    );

    expect(result).toEqual({
      kind: 'open',
      slots: [
        `${MONDAY}T09:00`,
        `${MONDAY}T09:30`,
        `${MONDAY}T17:00`,
        `${MONDAY}T17:30`,
      ],
    });
  });

  it('filtro de pasado: con "ahora" a mitad del día solo quedan slots futuros', () => {
    // now = 11:10 local Madrid del mismo día (09:10Z).
    const result = computeFreeSlots(
      makeInput({ now: new Date(`${MONDAY}T09:10:00Z`) }),
    );

    const slots = result.kind === 'open' ? result.slots : [];
    expect(slots[0]).toBe(`${MONDAY}T11:30`);
    expect(slots).not.toContain(`${MONDAY}T11:00`);
  });

  it('fecha inválida → invalid_date', () => {
    expect(computeFreeSlots(makeInput({ date: 'mañana' }))).toEqual({
      kind: 'invalid_date',
    });
  });
});

// Horario partido de referencia para los tests del guard: mañana y tarde el
// mismo lunes, con el hueco 14:00-16:00 cerrado entre franjas.
const SPLIT_SCHEDULE: WeeklySchedule = {
  mon: [
    { start: '09:00', end: '14:00' },
    { start: '16:00', end: '20:00' },
  ],
};

// Hora local Madrid del lunes de referencia, como DateTime en zona negocio
// (así llega el startsAt al guard en crear_cita).
function mondayAt(hhmm: string): DateTime {
  return DateTime.fromISO(`${MONDAY}T${hhmm}`, { zone: 'Europe/Madrid' });
}

describe('fitsWithinOpenInterval', () => {
  it('cita que cabe holgada dentro de una franja → true', () => {
    expect(fitsWithinOpenInterval(mondayAt('10:00'), 30, SPLIT_SCHEDULE)).toBe(
      true,
    );
  });

  it('la cita CABE JUSTO hasta el cierre (13:30 + 30 = 14:00) → true', () => {
    expect(fitsWithinOpenInterval(mondayAt('13:30'), 30, SPLIT_SCHEDULE)).toBe(
      true,
    );
  });

  it('el caso clave: empieza en horario pero DESBORDA el cierre (13:45 + 30 = 14:15) → false', () => {
    expect(fitsWithinOpenInterval(mondayAt('13:45'), 30, SPLIT_SCHEDULE)).toBe(
      false,
    );
  });

  it('servicio corto que sí cabe hasta el cierre (13:45 + 15 = 14:00) → true', () => {
    expect(fitsWithinOpenInterval(mondayAt('13:45'), 15, SPLIT_SCHEDULE)).toBe(
      true,
    );
  });

  it('antes de abrir (08:00) → false', () => {
    expect(fitsWithinOpenInterval(mondayAt('08:00'), 30, SPLIT_SCHEDULE)).toBe(
      false,
    );
  });

  it('hueco entre franjas (15:00, con 14:00-16:00 cerrado) → false', () => {
    expect(fitsWithinOpenInterval(mondayAt('15:00'), 30, SPLIT_SCHEDULE)).toBe(
      false,
    );
  });

  it('día sin intervalos (domingo) → false', () => {
    // 2026-07-12 es domingo; SPLIT_SCHEDULE no define sun.
    const sunday = DateTime.fromISO('2026-07-12T10:00', {
      zone: 'Europe/Madrid',
    });
    expect(fitsWithinOpenInterval(sunday, 30, SPLIT_SCHEDULE)).toBe(false);
  });

  it('duración no positiva → false', () => {
    expect(fitsWithinOpenInterval(mondayAt('10:00'), 0, SPLIT_SCHEDULE)).toBe(
      false,
    );
  });
});

describe('formatScheduleSummary', () => {
  it('agrupa días consecutivos idénticos en rangos y marca cerrados (jornada partida)', () => {
    const schedule: WeeklySchedule = {
      mon: [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '20:00' },
      ],
      tue: [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '20:00' },
      ],
      wed: [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '20:00' },
      ],
      thu: [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '20:00' },
      ],
      fri: [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '20:00' },
      ],
      sat: [{ start: '09:00', end: '14:00' }],
    };
    expect(formatScheduleSummary(schedule)).toBe(
      'lunes a viernes: 9:00-14:00 y 16:00-20:00; sábado: 9:00-14:00; domingo: cerrado',
    );
  });

  it('día suelto entre cerrados y sin cero inicial de hora', () => {
    expect(
      formatScheduleSummary({ wed: [{ start: '08:30', end: '15:00' }] }),
    ).toBe(
      'lunes a martes: cerrado; miércoles: 8:30-15:00; jueves a domingo: cerrado',
    );
  });
});

describe('buildUpcomingWeekCalendar', () => {
  // Fecha fija cruzando el fin de año: 29/12/2026 (martes) → las fechas deben
  // saltar a 2027 con luxon sumando días reales, no concatenando strings.
  const zonedNow = DateTime.fromISO('2026-12-29T23:34:00', {
    zone: 'Europe/Madrid',
  }).setLocale('es');

  it('lista los 7 días consecutivos desde hoy, cruzando fin de año, con hoy marcado', () => {
    expect(buildUpcomingWeekCalendar(zonedNow)).toBe(
      'Calendario de los próximos 7 días (Europe/Madrid): ' +
        'martes=2026-12-29 (hoy) · miércoles=2026-12-30 · jueves=2026-12-31 · ' +
        'viernes=2027-01-01 · sábado=2027-01-02 · domingo=2027-01-03 · ' +
        'lunes=2027-01-04',
    );
  });

  it('biyección día→fecha: exactamente 7 días y ningún nombre de día repetido', () => {
    const calendar = buildUpcomingWeekCalendar(zonedNow);
    const entries = calendar.split(': ')[1].split(' · ');
    expect(entries).toHaveLength(7);

    const dayNames = entries.map((e) => e.split('=')[0]);
    expect(new Set(dayNames).size).toBe(7);
  });

  it('usa la zona recibida para el label (no diverge de "Ahora es")', () => {
    const inCanary = DateTime.fromISO('2026-12-29T23:34:00', {
      zone: 'Atlantic/Canary',
    }).setLocale('es');
    expect(buildUpcomingWeekCalendar(inCanary)).toContain(
      '(Atlantic/Canary): martes=2026-12-29 (hoy)',
    );
  });
});
