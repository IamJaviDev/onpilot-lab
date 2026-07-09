"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/auth/session-context";
import { useConversationThread } from "@/lib/conversations/queries";
import { StatusBadge } from "./status-badge";
import { MessageBubble } from "./message-bubble";

export function ConversationThread({ id }: { id: string }) {
  const { activeBusiness } = useSession();
  const zone = activeBusiness?.timezone ?? "UTC";
  const query = useConversationThread(id);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = query.data?.messages.length ?? 0;

  // Baja al último mensaje al abrir el hilo y cuando llegan nuevos (polling).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount]);

  if (query.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-label">
        Cargando…
      </div>
    );
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-label">
          {notFound
            ? "Esta conversación no existe."
            : "No se pudo cargar la conversación."}
        </p>
        <Link
          href="/conversaciones"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-background"
        >
          Volver
        </Link>
      </div>
    );
  }

  const thread = query.data;
  const title = thread.client?.name ?? thread.phone;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabecera */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <Link
          href="/conversaciones"
          aria-label="Volver a conversaciones"
          className="shrink-0 text-label transition hover:text-ink md:hidden"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-ink">{title}</p>
            <StatusBadge status={thread.status} />
          </div>
          {thread.client ? (
            <Link
              href={`/clientes/${thread.client.id}`}
              className="text-xs text-brand hover:underline"
            >
              Ver ficha
            </Link>
          ) : (
            <span className="text-xs text-faint">{thread.phone}</span>
          )}
        </div>
      </div>

      {/* Hilo */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-label">
            Sin mensajes en esta conversación.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {thread.messages.map((m) => (
              <MessageBubble key={m.id} message={m} zone={zone} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
