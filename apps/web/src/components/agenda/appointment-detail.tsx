import type { Appointment } from "@/lib/appointments/types";
import { formatTime } from "@/lib/appointments/day-range";
import { STATUS_STYLES } from "./appointment-status";

// Estados activos: admiten cobrar, editar, cancelar y no-show. Los terminales
// (COMPLETED/CANCELLED/NO_SHOW) solo muestran datos.
const ACTIVE: Appointment["status"][] = ["SCHEDULED", "CONFIRMED"];

/**
 * Detalle de cita. Las acciones (cobrar/editar/cancelar/no-show) solo se ofrecen
 * en estados activos.
 */
export function AppointmentDetail({
  appointment,
  zone,
  onCharge,
  onEdit,
  onCancel,
  onNoShow,
}: {
  appointment: Appointment;
  zone: string;
  onCharge: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onNoShow: () => void;
}) {
  const status = STATUS_STYLES[appointment.status];
  const isActive = ACTIVE.includes(appointment.status);

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

      {isActive ? (
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCharge}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            Cobrar y cerrar
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-background"
          >
            Editar cita
          </button>
          <div className="mt-1 flex gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
            >
              Cancelar cita
            </button>
            <button
              type="button"
              onClick={onNoShow}
              className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-background"
            >
              No-show
            </button>
          </div>
        </div>
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
