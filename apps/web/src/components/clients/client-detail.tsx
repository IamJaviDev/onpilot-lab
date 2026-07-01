"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ClientAvatar, ClientTag } from "./client-bits";
import { ClientActivity } from "./client-activity";
import { ClientForm } from "./client-form";
import { VipToggle } from "./vip-toggle";
import { useDeleteClient, useUpdateClient } from "@/lib/clients/queries";
import type { ClientDetail } from "@/lib/clients/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}

export function ClientDetailView({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateMutation = useUpdateClient(client.id);
  const deleteMutation = useDeleteClient(client.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <Link
        href="/clientes"
        className="flex w-fit items-center gap-1 text-sm text-label transition hover:text-ink"
      >
        <ChevronLeft size={16} />
        Clientes
      </Link>

      {/* Cabecera */}
      <div className="flex items-center gap-4">
        <ClientAvatar name={client.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-ink">{client.name}</h1>
          <p className="text-xs text-label">
            Cliente desde {formatDate(client.createdAt)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {client.tags.map((tag) => (
              <ClientTag key={tag} tag={tag} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-background"
        >
          <Pencil size={14} />
          Editar
        </button>
      </div>

      <VipToggle client={client} />

      {/* Contacto */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Contacto</SectionLabel>
        <div className="flex items-center gap-2 text-sm text-ink">
          <Phone size={15} className="text-faint" />
          {client.phone}
        </div>
        <div className="flex items-center gap-2 text-sm text-ink">
          <Mail size={15} className="text-faint" />
          {client.email ?? <span className="text-faint">Sin email</span>}
        </div>
      </div>

      {/* Notas */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Notas del cliente</SectionLabel>
        {client.notes ? (
          <p className="whitespace-pre-wrap rounded-xl border border-border bg-white p-3 text-sm text-foreground">
            {client.notes}
          </p>
        ) : (
          <p className="text-sm text-faint">Sin notas.</p>
        )}
      </div>

      {/* Actividad: stats, próximas citas e historial */}
      <ClientActivity client={client} />

      {/* Borrar */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700"
        >
          <Trash2 size={15} />
          Borrar cliente
        </button>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Editar cliente"
      >
        <ClientForm
          mode="edit"
          submitLabel="Guardar cambios"
          defaultValues={{
            name: client.name,
            phone: client.phone,
            email: client.email ?? "",
            notes: client.notes ?? "",
          }}
          onSubmit={async (payload) => {
            await updateMutation.mutateAsync(payload);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Borrar cliente"
        message={`¿Seguro que quieres borrar a ${client.name}? Esta acción se puede revertir desde soporte, pero dejará de aparecer en tu lista.`}
        confirmLabel="Borrar"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(undefined, {
            onSuccess: () => router.push("/clientes"),
          })
        }
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
