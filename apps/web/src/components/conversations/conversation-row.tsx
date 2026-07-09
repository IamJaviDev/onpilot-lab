"use client";

import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/format";
import type { ConversationListItem } from "@/lib/conversations/types";

/** Inicial del avatar: primera letra del nombre, o del teléfono si no hay cliente. */
function initialOf(item: ConversationListItem): string {
  const source = item.client?.name ?? item.phone;
  const ch = source.trim()[0] ?? "?";
  return ch.toUpperCase();
}

/** Prefijo del preview según quién escribió el último mensaje. */
function previewPrefix(item: ConversationListItem): string {
  const last = item.lastMessage;
  if (!last) return "";
  if (last.direction === "IN") return "";
  return last.author === "BOT" ? "Bot: " : "Tú: ";
}

export function ConversationRow({
  item,
  active,
}: {
  item: ConversationListItem;
  active: boolean;
}) {
  const title = item.client?.name ?? item.phone;
  const preview = item.lastMessage
    ? `${previewPrefix(item)}${item.lastMessage.body}`
    : "Sin mensajes";

  return (
    <Link
      href={`/conversaciones/${item.id}`}
      className={`flex items-center gap-3 px-4 py-3 transition ${
        active ? "bg-brand/5" : "hover:bg-background"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-sm font-bold text-label">
        {initialOf(item)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <span className="shrink-0 text-xs text-faint">
            {formatRelativeTime(item.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-label">{preview}</p>
          <StatusBadge status={item.status} />
        </div>
      </div>
    </Link>
  );
}
