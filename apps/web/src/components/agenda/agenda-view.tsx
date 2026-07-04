"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/lib/auth/session-context";
import {
  useAppointmentsList,
  useCreateAppointment,
  useNoShowAppointment,
  useUpdateAppointment,
} from "@/lib/appointments/queries";
import {
  dayBounds,
  formatDayLabel,
  isToday,
  nextRoundTime,
  shiftDay,
  splitInstant,
  todayInZone,
} from "@/lib/appointments/day-range";
import type { Appointment } from "@/lib/appointments/types";
import { AppointmentCard } from "./appointment-card";
import { AppointmentDetail } from "./appointment-detail";
import { AppointmentForm } from "./appointment-form";
import { AppointmentCharge } from "./appointment-charge";
import { CancelAppointmentDialog } from "./cancel-appointment-dialog";

export function AgendaView() {
  const { activeBusiness } = useSession();
  const zone = activeBusiness?.timezone;

  if (!zone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-label">
          No hay un negocio activo para mostrar la agenda.
        </p>
      </div>
    );
  }

  return <AgendaForZone zone={zone} />;
}

type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "detail"; appointment: Appointment }
  | { type: "edit"; appointment: Appointment }
  | { type: "charge"; appointment: Appointment }
  | { type: "cancel"; appointment: Appointment }
  | { type: "noshow"; appointment: Appointment };

/** Separado para inicializar el día una vez conocida la zona del negocio. */
function AgendaForZone({ zone }: { zone: string }) {
  const [day, setDay] = useState(() => todayInZone(zone));
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const range = useMemo(() => dayBounds(day, zone), [day, zone]);
  const query = useAppointmentsList(range);

  const items = query.data ?? [];
  const onToday = isToday(day, zone);
  const close = () => setModal({ type: "none" });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-ink">Agenda</h1>
        <button
          type="button"
          onClick={() => setModal({ type: "create" })}
          className="flex items-center gap-1.5 rounded-full bg-[#1A1410] px-3 py-2 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition hover:bg-[#2d2520]"
        >
          <Plus size={16} />
          Nueva cita
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDay((d) => shiftDay(d, -1, zone))}
          aria-label="Día anterior"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setDay((d) => shiftDay(d, 1, zone))}
          aria-label="Día siguiente"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={() => setDay(todayInZone(zone))}
          disabled={onToday}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-background disabled:opacity-50"
        >
          Hoy
        </button>
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.target.value) setDay(e.target.value);
          }}
          className="ml-auto rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <p className="text-sm font-medium text-label">
        {formatDayLabel(day, zone)}
      </p>

      <div className="flex flex-col gap-2">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              zone={zone}
              onSelect={(a) => setModal({ type: "detail", appointment: a })}
            />
          ))
        )}
      </div>

      <Modal open={modal.type === "create"} onClose={close} title="Nueva cita">
        {modal.type === "create" ? (
          <CreateAppointmentForm zone={zone} defaultDay={day} onDone={close} />
        ) : null}
      </Modal>

      <Modal
        open={modal.type === "detail"}
        onClose={close}
        title="Detalle de cita"
      >
        {modal.type === "detail" ? (
          <AppointmentDetail
            appointment={modal.appointment}
            zone={zone}
            onCharge={() =>
              setModal({ type: "charge", appointment: modal.appointment })
            }
            onEdit={() =>
              setModal({ type: "edit", appointment: modal.appointment })
            }
            onCancel={() =>
              setModal({ type: "cancel", appointment: modal.appointment })
            }
            onNoShow={() =>
              setModal({ type: "noshow", appointment: modal.appointment })
            }
          />
        ) : null}
      </Modal>

      <Modal open={modal.type === "edit"} onClose={close} title="Editar cita">
        {modal.type === "edit" ? (
          <EditAppointmentForm
            appointment={modal.appointment}
            zone={zone}
            onDone={close}
          />
        ) : null}
      </Modal>

      <Modal
        open={modal.type === "charge"}
        onClose={close}
        title="Cobrar y cerrar"
      >
        {modal.type === "charge" ? (
          <AppointmentCharge appointment={modal.appointment} onDone={close} />
        ) : null}
      </Modal>

      <Modal
        open={modal.type === "cancel"}
        onClose={close}
        title="Cancelar cita"
      >
        {modal.type === "cancel" ? (
          <CancelAppointmentDialog
            appointmentId={modal.appointment.id}
            onDone={close}
          />
        ) : null}
      </Modal>

      {modal.type === "noshow" ? (
        <NoShowConfirm appointmentId={modal.appointment.id} onClose={close} />
      ) : null}
    </div>
  );
}

/** No-show: confirmación simple (sin motivo) sobre ConfirmDialog. */
function NoShowConfirm({
  appointmentId,
  onClose,
}: {
  appointmentId: string;
  onClose: () => void;
}) {
  const mutation = useNoShowAppointment(appointmentId);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    setError(undefined);
    try {
      await mutation.mutateAsync();
      onClose();
    } catch {
      setError("No se pudo marcar. La cita puede que ya no esté activa.");
    }
  };

  return (
    <ConfirmDialog
      open
      title="Marcar no-show"
      message="¿Marcar esta cita como no presentada? El cliente no acudió."
      confirmLabel="Marcar no-show"
      loadingLabel="Guardando…"
      loading={mutation.isPending}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}

/** Wrapper que aísla la mutación de alta (hook por modal abierto). */
function CreateAppointmentForm({
  zone,
  defaultDay,
  onDone,
}: {
  zone: string;
  defaultDay: string;
  onDone: () => void;
}) {
  const mutation = useCreateAppointment();
  const defaultTime = useMemo(() => nextRoundTime(zone).time, [zone]);

  return (
    <AppointmentForm
      mode="create"
      zone={zone}
      submitLabel="Crear cita"
      defaultValues={{
        clientId: "",
        serviceId: "",
        date: defaultDay,
        time: defaultTime,
        notes: "",
      }}
      onSubmit={async (payload) => {
        await mutation.mutateAsync(payload);
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

/** Wrapper que aísla la mutación de edición (hook keyed por id de la cita). */
function EditAppointmentForm({
  appointment,
  zone,
  onDone,
}: {
  appointment: Appointment;
  zone: string;
  onDone: () => void;
}) {
  const mutation = useUpdateAppointment(appointment.id);
  const { day, time } = splitInstant(appointment.startsAt, zone);

  return (
    <AppointmentForm
      mode="edit"
      zone={zone}
      submitLabel="Guardar cambios"
      lockedClient={{
        id: appointment.client.id,
        name: appointment.client.name,
      }}
      defaultValues={{
        clientId: appointment.client.id,
        serviceId: appointment.service.id,
        date: day,
        time,
        notes: appointment.notes ?? "",
      }}
      onSubmit={async (payload) => {
        await mutation.mutateAsync(payload);
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
        >
          <div className="h-4 w-12 animate-pulse rounded bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-background" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-background" />
          </div>
        </div>
      ))}
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white px-6 py-12 text-center">
      <p className="text-sm text-label">No se pudieron cargar las citas.</p>
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-label">
      Sin citas este día.
    </div>
  );
}
