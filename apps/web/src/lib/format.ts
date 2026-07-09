import { DateTime } from "luxon";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/** Formatea un importe (number de display) como "45,00 €". */
export function formatEur(amount: number): string {
  return eur.format(amount);
}

/**
 * Hora relativa en español ("hace 2 h", "hace 3 días"). Independiente de la
 * zona: es la distancia hasta ahora. Devuelve "" si la fecha es nula/ inválida.
 */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso).setLocale("es");
  return dt.isValid ? (dt.toRelative() ?? "") : "";
}

/**
 * Hora del reloj en la ZONA DEL NEGOCIO ("10:05" / "8 jul, 10:05" si es de otro
 * día que hoy), para los timestamps de las burbujas del hilo.
 */
export function formatClockTime(iso: string, zone: string): string {
  const dt = DateTime.fromISO(iso, { zone }).setLocale("es");
  if (!dt.isValid) return "";
  const isToday = dt.hasSame(DateTime.now().setZone(zone), "day");
  return isToday
    ? dt.toFormat("HH:mm")
    : dt.toFormat("d LLL, HH:mm");
}
