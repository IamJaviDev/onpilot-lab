import { DateTime } from "luxon";

/**
 * Utilidades de fecha de la Agenda, todas en la ZONA DEL NEGOCIO.
 *
 * El "día" de la agenda es un día natural en el timezone del negocio (no el del
 * navegador ni UTC). Mismo criterio DST-safe que el Dashboard backend: los
 * límites se calculan en la zona y se convierten a instantes UTC para la query.
 *
 * - `day` se representa como string ISO de fecha: "YYYY-MM-DD".
 * - `from`/`to` se envían al backend como instantes UTC ISO; el backend filtra
 *   `startsAt` con gte/lte sobre instantes absolutos.
 */

function toIsoDate(dt: DateTime): string {
  const value = dt.toISODate();
  if (value === null) {
    throw new Error("Fecha inválida al calcular el día de la agenda");
  }
  return value;
}

function toUtcInstant(dt: DateTime): string {
  const value = dt.toUTC().toISO();
  if (value === null) {
    throw new Error("Instante inválido al calcular los límites del día");
  }
  return value;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Día natural de hoy ("YYYY-MM-DD") en la zona del negocio. */
export function todayInZone(zone: string): string {
  return toIsoDate(DateTime.now().setZone(zone));
}

/** Desplaza el día `delta` jornadas (en la zona del negocio). */
export function shiftDay(dayISO: string, delta: number, zone: string): string {
  return toIsoDate(DateTime.fromISO(dayISO, { zone }).plus({ days: delta }));
}

/**
 * Límites [from, to] del día como instantes UTC ISO. El inicio es la medianoche
 * local del negocio; el fin, el último instante del día local. DST-safe porque
 * luxon resuelve la medianoche en la zona antes de pasar a UTC.
 */
export function dayBounds(
  dayISO: string,
  zone: string,
): { from: string; to: string } {
  const start = DateTime.fromISO(dayISO, { zone }).startOf("day");
  const end = DateTime.fromISO(dayISO, { zone }).endOf("day");
  return { from: toUtcInstant(start), to: toUtcInstant(end) };
}

/** ¿El día seleccionado es hoy en la zona del negocio? */
export function isToday(dayISO: string, zone: string): boolean {
  return dayISO === todayInZone(zone);
}

/** Etiqueta legible del día, p. ej. "Sábado, 28 de junio". */
export function formatDayLabel(dayISO: string, zone: string): string {
  const label = DateTime.fromISO(dayISO, { zone })
    .setLocale("es")
    .toFormat("cccc, d 'de' LLLL");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Hora de la cita ("HH:mm") en la zona del negocio. */
export function formatTime(instantISO: string, zone: string): string {
  return DateTime.fromISO(instantISO).setZone(zone).toFormat("HH:mm");
}

/**
 * Construye `startsAt` desde la fecha+hora elegidas por el usuario INTERPRETADAS
 * en la zona del negocio → ISO-8601 CON offset (±HH:MM). Reverso de la Pieza 1:
 * nunca usa la zona del navegador. Es lo que exige el backend.
 */
export function buildStartsAt(
  dayISO: string,
  timeHHmm: string,
  zone: string,
): string {
  const dt = DateTime.fromISO(`${dayISO}T${timeHHmm}`, { zone });
  const value = dt.toISO();
  if (value === null) {
    throw new Error("Fecha/hora inválida al construir startsAt");
  }
  return value;
}

/**
 * Inverso de buildStartsAt: parte un instante (UTC) en {day, time} en la zona
 * del negocio, para prefijar el formulario en edición.
 */
export function splitInstant(
  instantISO: string,
  zone: string,
): { day: string; time: string } {
  const dt = DateTime.fromISO(instantISO).setZone(zone);
  return { day: toIsoDate(dt), time: dt.toFormat("HH:mm") };
}

/**
 * Próxima hora en punto en la zona del negocio, como {day, time}. Default de
 * "Nueva cita" (editable). Si ya pasó la última hora del día, rueda al siguiente.
 */
export function nextRoundTime(zone: string): { day: string; time: string } {
  const dt = DateTime.now()
    .setZone(zone)
    .plus({ hours: 1 })
    .startOf("hour");
  return { day: toIsoDate(dt), time: dt.toFormat("HH:mm") };
}

// --- Semana (vista semanal de la agenda) ---
//
// La "semana" es lunes→domingo en la zona del negocio (semana ISO de luxon,
// correcta para España), DST-safe. `anchorISO` es cualquier día natural dentro
// de la semana; los helpers derivan de él los límites/días de esa semana.

/** Límites [from, to] de la semana que contiene `anchorISO`, como UTC ISO. */
export function weekBounds(
  anchorISO: string,
  zone: string,
): { from: string; to: string } {
  const anchor = DateTime.fromISO(anchorISO, { zone });
  return {
    from: toUtcInstant(anchor.startOf("week")),
    to: toUtcInstant(anchor.endOf("week")),
  };
}

/** Los 7 días ("YYYY-MM-DD") de la semana, de lunes a domingo. */
export function weekDays(anchorISO: string, zone: string): string[] {
  const monday = DateTime.fromISO(anchorISO, { zone }).startOf("week");
  return Array.from({ length: 7 }, (_, i) =>
    toIsoDate(monday.plus({ days: i })),
  );
}

/** Desplaza `delta` semanas (en la zona del negocio). */
export function shiftWeek(
  anchorISO: string,
  delta: number,
  zone: string,
): string {
  return toIsoDate(DateTime.fromISO(anchorISO, { zone }).plus({ weeks: delta }));
}

/** Día seleccionado por defecto: hoy si la semana lo contiene; si no, el lunes. */
export function selectedDayForWeek(anchorISO: string, zone: string): string {
  const today = todayInZone(zone);
  const days = weekDays(anchorISO, zone);
  return days.includes(today) ? today : days[0];
}

/**
 * Etiqueta legible del rango semanal, p. ej. "8 — 14 Julio 2026". Contrae el
 * mes/año compartidos; si cruza mes o año, muestra ambos ("28 Jun — 4 Jul 2026").
 */
export function formatWeekRange(anchorISO: string, zone: string): string {
  const monday = DateTime.fromISO(anchorISO, { zone })
    .startOf("week")
    .setLocale("es");
  const sunday = monday.endOf("week");

  if (monday.hasSame(sunday, "month")) {
    return `${monday.day} — ${sunday.day} ${capitalize(monday.toFormat("LLLL"))} ${monday.year}`;
  }
  if (monday.hasSame(sunday, "year")) {
    return `${monday.day} ${capitalize(monday.toFormat("LLL"))} — ${sunday.day} ${capitalize(sunday.toFormat("LLL"))} ${sunday.year}`;
  }
  return `${monday.day} ${capitalize(monday.toFormat("LLL"))} ${monday.year} — ${sunday.day} ${capitalize(sunday.toFormat("LLL"))} ${sunday.year}`;
}

/** Nombre corto + número de día para un tab, p. ej. { name: "Lun", num: "8" }. */
export function dayTabLabel(
  dayISO: string,
  zone: string,
): { name: string; num: string } {
  const dt = DateTime.fromISO(dayISO, { zone }).setLocale("es");
  return {
    name: capitalize(dt.toFormat("ccc").replace(/\.$/, "")),
    num: dt.toFormat("d"),
  };
}
