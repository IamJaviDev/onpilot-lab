"use client";

import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/conversations/conversation-list";

/**
 * Shell master-detail del panel. La lista vive aquí (en el layout), así persiste
 * entre `/conversaciones` y `/conversaciones/[id]`: no se remonta → polling,
 * scroll y filtro se conservan. `{children}` es el panel de detalle.
 *
 * Responsive: en desktop se ven las dos columnas siempre. En móvil se muestra
 * una sola según la ruta (lista en el índice, hilo en el detalle).
 */
export default function ConversacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const match = pathname.match(/^\/conversaciones\/(.+)$/);
  const selectedId = match ? match[1] : null;

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`${
          selectedId ? "hidden md:flex" : "flex"
        } w-full shrink-0 flex-col border-r border-border bg-white md:w-80`}
      >
        <ConversationList selectedId={selectedId} />
      </div>
      <div
        className={`${
          selectedId ? "flex" : "hidden md:flex"
        } min-w-0 flex-1 flex-col`}
      >
        {children}
      </div>
    </div>
  );
}
