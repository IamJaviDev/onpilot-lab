"use client";

import { useState } from "react";
import { ConversationRow } from "./conversation-row";
import { useConversationsList } from "@/lib/conversations/queries";
import type { ConversationStatus } from "@/lib/conversations/types";

const LIMIT = 20;

/** Chips de filtro. `undefined` = todas; los demás filtran por estado. */
const FILTERS: { label: string; value: ConversationStatus | undefined }[] = [
  { label: "Todas", value: undefined },
  { label: "Requieren atención", value: "PENDING_REVIEW" },
  { label: "Activas", value: "BOT_ACTIVE" },
];

export function ConversationList({
  selectedId,
}: {
  selectedId: string | null;
}) {
  const [status, setStatus] = useState<ConversationStatus | undefined>(
    undefined,
  );
  const [page, setPage] = useState(1);

  const query = useConversationsList({ status, page, limit: LIMIT });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const items = query.data?.items ?? [];

  const onFilter = (value: ConversationStatus | undefined) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
        <h1 className="text-xl font-extrabold text-ink">Conversaciones</h1>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = status === f.value;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => onFilter(f.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-white text-ink hover:bg-background"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState filtered={status !== undefined} />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <ConversationRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
              />
            ))}
          </div>
        )}
      </div>

      {total > LIMIT ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-label">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isFetching}
              className="rounded-lg border border-border bg-white px-3 py-1.5 transition hover:bg-background disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || query.isFetching}
              className="rounded-lg border border-border bg-white px-3 py-1.5 transition hover:bg-background disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-background" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-background" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-label">
        No se pudieron cargar las conversaciones.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-background"
      >
        Reintentar
      </button>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-label">
      {filtered
        ? "No hay conversaciones con este filtro."
        : "Aún no hay conversaciones."}
    </div>
  );
}
