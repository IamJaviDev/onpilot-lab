import type { ReactNode } from "react";

// Negrita de WhatsApp/markdown en las burbujas del hilo. Dos convenciones
// reales en los datos: **doble** (texto libre del bot, mayoría) y *simple*
// (plantilla de recordatorio). La alternancia prueba ** ANTES que * para que
// "**x**" no se lea como asteriscos sueltos. [^*]+ exige contenido no vacío y
// sin asteriscos internos: los casos límite (asterisco suelto sin cerrar,
// "**"/"****" vacío) no matchean y caen a texto literal.
//
// Devuelve NODOS React (no HTML): React escapa todo el texto por construcción,
// así que el body arbitrario del cliente NUNCA se interpreta como HTML. Sin
// dangerouslySetInnerHTML y sin string HTML intermedio → sin vía de XSS.
const BOLD = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function renderMessageBody(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of body.matchAll(BOLD)) {
    const start = m.index ?? last;
    if (start > last) nodes.push(body.slice(last, start));
    nodes.push(<strong key={i++}>{m[1] ?? m[2]}</strong>);
    last = start + m[0].length;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes;
}
