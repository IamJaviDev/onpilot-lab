import { DateTime } from 'luxon';

/**
 * Cálculo puro de disponibilidad (H2 T5): sin Nest, sin Prisma. Recibe el
 * horario semanal del negocio, las citas activas del día y la duración del
 * servicio, y devuelve los huecos libres. Todo el cálculo ocurre en la
 * timezone del negocio (luxon, DST-safe); las citas llegan como instantes
 * (Date UTC de BD) y se comparan como instantes.
 */

// Rejilla fija de slots: horas naturales (10:00, 10:30) — lo que un humano
// espera leer en WhatsApp. El empaquetado subóptimo frente a paso=duración
// es aceptable en v1 (decisión aprobada en el plan).
export const SLOT_INTERVAL_MINUTES = 30;

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface ScheduleInterval {
  // Hora local del negocio, formato "HH:mm".
  start: string;
  end: string;
}

export type WeeklySchedule = Partial<Record<DayKey, ScheduleInterval[]>>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parser tolerante del Json de Business.weeklySchedule: cualquier cosa que no
 * cumpla el formato → null (equivale a "sin horario configurado"; el llamante
 * loguea). Nunca lanza: un Json corrupto en BD no debe tumbar al bot.
 */
export function parseWeeklySchedule(value: unknown): WeeklySchedule | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const schedule: WeeklySchedule = {};
  for (const [key, intervals] of Object.entries(value)) {
    if (!DAY_KEYS.includes(key as DayKey)) return null;
    if (!Array.isArray(intervals)) return null;
    const parsed: ScheduleInterval[] = [];
    for (const interval of intervals as unknown[]) {
      if (typeof interval !== 'object' || interval === null) return null;
      const { start, end } = interval as { start?: unknown; end?: unknown };
      if (typeof start !== 'string' || !TIME_RE.test(start)) return null;
      if (typeof end !== 'string' || !TIME_RE.test(end)) return null;
      if (end <= start) return null;
      parsed.push({ start, end });
    }
    schedule[key as DayKey] = parsed;
  }
  return schedule;
}

export interface ComputeFreeSlotsInput {
  // Día a consultar, "YYYY-MM-DD" (interpretado en zona negocio).
  date: string;
  // Timezone IANA del negocio (Business.timezone).
  timezone: string;
  schedule: WeeklySchedule;
  durationMinutes: number;
  // Citas activas que intersectan el día (instantes UTC de BD).
  appointments: Array<{ startsAt: Date; endsAt: Date }>;
  // Instante actual, inyectable en tests.
  now: Date;
}

export type ComputeFreeSlotsResult =
  | { kind: 'invalid_date' }
  | { kind: 'closed' }
  // Slots en hora local del negocio, formato "yyyy-MM-ddTHH:mm" — reutilizable
  // tal cual como fechaHora de crear_cita. Vacío = día sin huecos libres.
  | { kind: 'open'; slots: string[] };

/**
 * Huecos libres de un día: para cada intervalo del horario, slots en rejilla
 * de 30 min donde cabe la duración completa, que no solapen ninguna cita
 * activa y que estén en el futuro.
 */
export function computeFreeSlots(
  input: ComputeFreeSlotsInput,
): ComputeFreeSlotsResult {
  const { date, timezone, schedule, durationMinutes, appointments, now } =
    input;

  const day = DateTime.fromISO(date, { zone: timezone });
  if (!day.isValid || durationMinutes <= 0) return { kind: 'invalid_date' };

  // luxon: weekday 1 (lunes) … 7 (domingo) — alineado con DAY_KEYS.
  const intervals = schedule[DAY_KEYS[day.weekday - 1]] ?? [];
  if (intervals.length === 0) return { kind: 'closed' };

  const nowMs = now.getTime();
  const slots: string[] = [];

  for (const interval of intervals) {
    const [startH, startM] = interval.start.split(':').map(Number);
    const [endH, endM] = interval.end.split(':').map(Number);
    const intervalStart = day.set({
      hour: startH,
      minute: startM,
      second: 0,
      millisecond: 0,
    });
    const intervalEnd = day.set({
      hour: endH,
      minute: endM,
      second: 0,
      millisecond: 0,
    });

    for (
      let slot = intervalStart;
      slot.plus({ minutes: durationMinutes }) <= intervalEnd;
      slot = slot.plus({ minutes: SLOT_INTERVAL_MINUTES })
    ) {
      const slotStartMs = slot.toMillis();
      const slotEndMs = slot.plus({ minutes: durationMinutes }).toMillis();

      if (slotStartMs <= nowMs) continue;

      const overlaps = appointments.some(
        (a) =>
          slotStartMs < a.endsAt.getTime() && slotEndMs > a.startsAt.getTime(),
      );
      if (overlaps) continue;

      slots.push(slot.toFormat("yyyy-MM-dd'T'HH:mm"));
    }
  }

  return { kind: 'open', slots };
}
