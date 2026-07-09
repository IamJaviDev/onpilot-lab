/**
 * Metadata de un Message que SÍ puede ver el negocio en el panel. Deliberada-
 * mente minúscula: los OUT del bot guardan además tokens, modelo, toolCalls,
 * phantomGuard y (en recordatorios) appointmentId — información interna del
 * sistema, no del negocio, que JAMÁS sale por la API de lectura.
 */
export interface PublicMessageMetadata {
  reminder?: boolean;
  escalation?: { motivo: string };
}

/**
 * Sanea la metadata cruda de un Message a lo publicable. WHITELIST, no
 * blacklist: copia SOLO los campos conocidos y seguros, así cualquier campo
 * nuevo que el bot añada en el futuro es inalcanzable por construcción (no hay
 * que acordarse de excluirlo). Devuelve `null` si no queda nada útil, para que
 * el frontend distinga "sin marcadores" de "objeto vacío".
 */
export function sanitizeMessageMetadata(
  raw: unknown,
): PublicMessageMetadata | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const out: PublicMessageMetadata = {};

  if (source.reminder === true) {
    out.reminder = true;
  }

  const escalation = source.escalation;
  if (
    escalation !== null &&
    typeof escalation === 'object' &&
    typeof (escalation as Record<string, unknown>).motivo === 'string'
  ) {
    out.escalation = {
      motivo: (escalation as { motivo: string }).motivo,
    };
  }

  return Object.keys(out).length > 0 ? out : null;
}
