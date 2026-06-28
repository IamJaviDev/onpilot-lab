"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Label } from "@/components/ui/form";
import { useCancelAppointment } from "@/lib/appointments/queries";

function mapError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "La cita ya no está activa.";
  }
  return "No se pudo cancelar. Inténtalo de nuevo.";
}

/** Cancelación de cita con motivo OPCIONAL (texto de gestión, máx 500). */
export function CancelAppointmentDialog({
  appointmentId,
  onDone,
}: {
  appointmentId: string;
  onDone: () => void;
}) {
  const mutation = useCancelAppointment(appointmentId);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string>();

  const confirm = async () => {
    setFormError(undefined);
    try {
      const trimmed = reason.trim();
      await mutation.mutateAsync({ reason: trimmed ? trimmed : undefined });
      onDone();
    } catch (error) {
      setFormError(mapError(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-label">
        Esta cita quedará cancelada. Puedes anotar un motivo (opcional).
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Motivo</Label>
        <textarea
          id="reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. el cliente no puede asistir"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {formError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onDone}
          disabled={mutation.isPending}
          className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-background disabled:opacity-60"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={mutation.isPending}
          className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {mutation.isPending ? "Cancelando…" : "Cancelar cita"}
        </button>
      </div>
    </div>
  );
}
