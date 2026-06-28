import { DateTime } from "luxon";

/**
 * Rangos de periodo en la ZONA DEL NEGOCIO (no la del navegador), con luxon.
 *
 * Genérico y reutilizable (Caja hoy, Dashboard mañana). Cada periodo se acota
 * con `startOf`/`endOf` en la zona del negocio y se convierte a instantes UTC
 * ISO con offset, que es lo que exigen los endpoints (regex `Z|±HH:MM`).
 * DST-safe: luxon resuelve los límites en la zona antes de pasar a UTC. Semana
 * en lunes (ISO, default de luxon → correcto para España).
 */

export type CashPeriod = "today" | "week" | "month" | "year";

const UNIT: Record<CashPeriod, "day" | "week" | "month" | "year"> = {
  today: "day",
  week: "week",
  month: "month",
  year: "year",
};

function toUtcInstant(dt: DateTime): string {
  const value = dt.toUTC().toISO();
  if (value === null) {
    throw new Error("Instante inválido al calcular los límites del periodo");
  }
  return value;
}

export function periodBounds(
  period: CashPeriod,
  zone: string,
): { from: string; to: string } {
  const now = DateTime.now().setZone(zone);
  const unit = UNIT[period];
  return {
    from: toUtcInstant(now.startOf(unit)),
    to: toUtcInstant(now.endOf(unit)),
  };
}
