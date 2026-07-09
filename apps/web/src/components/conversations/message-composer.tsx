"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useSendManualMessage } from "@/lib/conversations/queries";
import type { ConversationStatus } from "@/lib/conversations/types";

/**
 * Texto de error para el pie. El backend ya redacta mensajes accionables y
 * distintos por caso (409 sin control · 422 ventana 24 h · 422 sandbox · 502
 * rechazo de Meta) — se muestran tal cual, sin duplicar las cadenas aquí. Solo
 * los fallos sin respuesta (red/timeout) caen al genérico local.
 */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return "No se pudo enviar el mensaje. Revisa la conexión e inténtalo de nuevo.";
}

export function MessageComposer({
  conversationId,
  status,
}: {
  conversationId: string;
  status: ConversationStatus;
}) {
  const [text, setText] = useState("");
  const mutation = useSendManualMessage(conversationId);
  const enabled = status === "HUMAN_CONTROL";

  if (!enabled) {
    return (
      <div className="border-t border-border bg-white px-4 py-3 text-center text-xs text-label">
        Toma el control para escribir.
      </div>
    );
  }

  const onSend = async () => {
    const body = text.trim();
    if (!body || mutation.isPending) return;
    try {
      await mutation.mutateAsync(body);
      setText(""); // la invalidación refresca el hilo → aparece el mensaje
    } catch {
      // El error se muestra abajo vía mutation.error; el texto NO se pierde.
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-white px-4 py-3">
      {mutation.isError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
          rows={1}
          placeholder="Escribe un mensaje…"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={!text.trim() || mutation.isPending}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {mutation.isPending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
