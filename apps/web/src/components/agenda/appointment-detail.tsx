import type { Appointment } from "@/lib/appointments/types";
import { formatTime } from "@/lib/appointments/day-range";
import { STATUS_STYLES } from "./appointment-status";

const EDITABLE: Appointment["status"][] = ["SCHEDULED", "CONFIRMED"];

/**
 * Detalle de cita (solo lectura de agenda). El botón "Editar" solo se ofrece en
 * estados activos; cobrar/cancelar llegan en la Pieza 3.
 */
export function AppointmentDetail({
  appointment,
  zone,
  onEdit,
}: {
  appointment: Appointment;
  zone: string;
  onEdit: () => void;
}) {
  const status = STATUS_STYLES[appointment.status];
  const canEdit = EDITABLE.includes(appointment.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-ink">
          {formatTime(appointment.startsAt, zone)} –{" "}
          {formatTime(appointment.endsAt, zone)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.badge}`}
        >
          {status.label}
        </span>
      </div>

      <Row label="Cliente">
        <span className="text-ink">{appointment.client.name}</span>
        <span className="block text-xs text-label">
          {appointment.client.phone}
        </span>
      </Row>
      <Row label="Servicio">
        <span className="text-ink">{appointment.service.name}</span>
      </Row>
      {appointment.notes ? (
        <Row label="Notas">
          <span className="whitespace-pre-wrap text-ink">
            {appointment.notes}
          </span>
        </Row>
      ) : null}

      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-2 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Editar cita
        </button>
      ) : null}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-label">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}
