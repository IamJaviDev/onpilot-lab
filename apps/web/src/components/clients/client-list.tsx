"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "./client-form";
import { ClientRow } from "./client-row";
import { useClientsList, useCreateClient } from "@/lib/clients/queries";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

const LIMIT = 20;

export function ClientList() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const search = useDebouncedValue(searchInput.trim(), 300);
  const createMutation = useCreateClient();

  const query = useClientsList({
    search: search || undefined,
    page,
    limit: LIMIT,
  });

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1); // cualquier cambio de búsqueda vuelve a la primera página
  };

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const items = query.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-ink">Clientes</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-[#1A1410] px-3 py-2 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition hover:bg-[#2d2520]"
        >
          <Plus size={16} />
          Nuevo cliente
        </button>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email…"
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            hasSearch={Boolean(search)}
            search={search}
            onCreate={() => setCreating(true)}
          />
        ) : (
          items.map((client) => <ClientRow key={client.id} client={client} />)
        )}
      </div>

      {total > LIMIT ? (
        <div className="flex items-center justify-between text-sm text-label">
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

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo cliente"
      >
        <ClientForm
          mode="create"
          submitLabel="Crear cliente"
          onSubmit={async (payload) => {
            await createMutation.mutateAsync(payload);
            setCreating(false);
            setPage(1);
          }}
          onCancel={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-background" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-background" />
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
        No se pudieron cargar los clientes.
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

function EmptyState({
  hasSearch,
  search,
  onCreate,
}: {
  hasSearch: boolean;
  search: string;
  onCreate: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="px-6 py-12 text-center text-sm text-label">
        Sin resultados para «{search}».
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-label">Aún no tienes clientes.</p>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-full bg-[#1A1410] px-4 py-2 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition hover:bg-[#2d2520]"
      >
        Crear el primero
      </button>
    </div>
  );
}
