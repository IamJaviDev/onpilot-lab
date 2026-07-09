"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  useReleaseToBot,
  useTakeControl,
} from "@/lib/conversations/queries";
import type { ConversationStatus } from "@/lib/conversations/types";

/**
 * Botón primario contextual de la cabecera del hilo:
 * - BOT_ACTIVE / PENDING_REVIEW → "Tomar control" (destacado si el bot escaló).
 * - HUMAN_CONTROL → "Devolver al bot" (con confirmación ligera).
 * - CLOSED → sin acción.
 */
export function ThreadActions({
  conversationId,
  status,
}: {
  conversationId: string;
  status: ConversationStatus;
}) {
  const takeControl = useTakeControl(conversationId);
  const release = useReleaseToBot(conversationId);
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  if (status === "CLOSED") return null;

  if (status === "HUMAN_CONTROL") {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmingRelease(true)}
          className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
        >
          Devolver al bot
        </button>

        <Modal
          open={confirmingRelease}
          onClose={() => setConfirmingRelease(false)}
          title="¿Devolver al bot?"
        >
          <p className="mb-5 text-sm text-label">
            El bot volverá a responder automáticamente a este cliente.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingRelease(false)}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-background"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={release.isPending}
              onClick={async () => {
                await release.mutateAsync();
                setConfirmingRelease(false);
              }}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {release.isPending ? "Devolviendo…" : "Devolver al bot"}
            </button>
          </div>
        </Modal>
      </>
    );
  }

  // BOT_ACTIVE o PENDING_REVIEW → tomar control (acción segura, sin confirmación).
  const highlighted = status === "PENDING_REVIEW";
  return (
    <button
      type="button"
      disabled={takeControl.isPending}
      onClick={() => takeControl.mutate()}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        highlighted
          ? "bg-brand text-white hover:bg-brand-hover"
          : "border border-border bg-white text-ink hover:bg-background"
      }`}
    >
      {takeControl.isPending ? "Tomando…" : "Tomar control"}
    </button>
  );
}
