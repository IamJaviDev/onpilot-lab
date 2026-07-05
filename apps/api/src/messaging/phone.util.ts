/**
 * Normaliza un teléfono a E.164 (`+` seguido de solo dígitos).
 *
 * WhatsApp Cloud API entrega el `from` como dígitos en formato internacional
 * sin el prefijo '+' (p. ej. "34600000000"). Aquí lo dejamos canónico para el
 * campo `Conversation.phone`.
 *
 * OJO: H1 puede guardar teléfonos de Client en formato local ("600000000"); la
 * vinculación Conversation→Client por teléfono es best-effort y puede no casar.
 * Deuda apuntada: unificar normalización de teléfonos H1↔E.164.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return `+${digits}`;
}
