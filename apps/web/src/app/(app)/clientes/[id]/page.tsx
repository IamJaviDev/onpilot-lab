"use client";

import { use } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { useClient } from "@/lib/clients/queries";
import { ClientDetailView } from "@/components/clients/client-detail";

export default function ClienteFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useClient(id);

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-label">
        Cargando…
      </div>
    );
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 px-4 py-10">
        <p className="text-sm text-label">
          {notFound
            ? "Este cliente no existe o fue borrado."
            : "No se pudo cargar el cliente."}
        </p>
        <Link
          href="/clientes"
          className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-background"
        >
          Volver a Clientes
        </Link>
      </div>
    );
  }

  return <ClientDetailView client={query.data} />;
}
