import type { ConversationStatus } from "@/lib/conversations/types";

/** Etiqueta + color de cada estado. Colores sobre la paleta cálida existente. */
const STATUS_META: Record<
  ConversationStatus,
  { label: string; className: string }
> = {
  BOT_ACTIVE: {
    label: "Bot activo",
    className: "bg-brand/10 text-brand",
  },
  PENDING_REVIEW: {
    label: "Requiere atención",
    className: "bg-amber-100 text-amber-700",
  },
  HUMAN_CONTROL: {
    label: "Tú al mando",
    className: "bg-blue-100 text-blue-700",
  },
  CLOSED: {
    label: "Cerrada",
    className: "bg-background text-faint",
  },
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
