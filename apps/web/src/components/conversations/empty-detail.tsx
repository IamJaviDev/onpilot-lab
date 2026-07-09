import { MessageCircle } from "lucide-react";

/** Panel derecho del master-detail cuando no hay conversación seleccionada. */
export function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-label">
      <MessageCircle size={32} className="text-faint" />
      <p className="text-sm">Selecciona una conversación</p>
    </div>
  );
}
