"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
  formatWeekRange,
  nextRoundTime,
  selectedDayForWeek,
  shiftWeek,
  splitInstant,
  todayInZone,
  weekBounds,
  weekDays,
} from "@/lib/appointments/day-range";
import type { Appointment } from "@/lib/appointments/types";
import { AppointmentCard } from "./appointment-card";
import { AppointmentDetail } from "./appointment-detail";
import { AppointmentForm } from "./appointment-form";
import { AppointmentCharge } from "./appointment-charge";
import { CancelAppointmentDialog } from "./cancel-appointment-dialog";
import { DayTabs } from "./day-tabs";
import { WeekNav } from "./week-nav";

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

/** Separado para inicializar la semana una vez conocida la zona del negocio. */
function AgendaForZone({ zone }: { zone: string }) {
  // `weekAnchor` = día cualquiera dentro de la semana visible; `selectedDay` =
  // día cuya lista se muestra. Ambos arrancan en hoy (zona negocio).
  const [weekAnchor, setWeekAnchor] = useState(() => todayInZone(zone));
  const [selectedDay, setSelectedDay] = useState(() => todayInZone(zone));
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Una sola query trae los 7 días de la semana; la key es el rango semanal, así
  // que cambiar de semana refetchea y cambiar de día NO.
  const range = useMemo(() => weekBounds(weekAnchor, zone), [weekAnchor, zone]);
  const query = useAppointmentsList(range);

  const days = useMemo(() => weekDays(weekAnchor, zone), [weekAnchor, zone]);
  const items = useMemo(() => query.data ?? [], [query.data]);

  // Agrupa las citas de la semana por día (zona negocio), cada grupo ordenado
  // por hora. La lista del día seleccionado se filtra de aquí, sin refetch.
  const groups = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of items) {
      const key = splitInstant(appt.startsAt, zone).day;
      const list = map.get(key);
      if (list) list.push(appt);
      else map.set(key, [appt]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [items, zone]);

  // Punto indicador: solo días con ≥1 cita NO cancelada.
  const daysWithAppointments = useMemo(() => {
    const set = new Set<string>();
    for (const appt of items) {
      if (appt.status === "CANCELLED") continue;
      set.add(splitInstant(appt.startsAt, zone).day);
    }
    return set;
  }, [items, zone]);

  const dayItems = groups.get(selectedDay) ?? [];
  const isCurrentWeek = days[0] === weekDays(todayInZone(zone), zone)[0];
  const close = () => setModal({ type: "none" });

  const goWeek = (delta: number) => {
    const nextAnchor = shiftWeek(weekAnchor, delta, zone);
    setWeekAnchor(nextAnchor);
    setSelectedDay(selectedDayForWeek(nextAnchor, zone));
  };
  const goToday = () => {
    const today = todayInZone(zone);
    setWeekAnchor(today);
    setSelectedDay(today);
  };

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

      <WeekNav
        rangeLabel={formatWeekRange(weekAnchor, zone)}
        isCurrentWeek={isCurrentWeek}
        onPrev={() => goWeek(-1)}
        onNext={() => goWeek(1)}
        onToday={goToday}
      />

      <DayTabs
        days={days}
        selectedDay={selectedDay}
        daysWithAppointments={daysWithAppointments}
        zone={zone}
        onSelect={setSelectedDay}
      />

      <div className="flex flex-col gap-2">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : dayItems.length === 0 ? (
          <EmptyState />
        ) : (
          dayItems.map((appointment) => (
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
          <CreateAppointmentForm
            zone={zone}
            defaultDay={selectedDay}
            onDone={close}
          />
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
