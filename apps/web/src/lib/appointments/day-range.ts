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
