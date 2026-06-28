import type { Appointment } from "@/lib/appointments/types";
import { formatTime } from "@/lib/appointments/day-range";
import { STATUS_STYLES } from "./appointment-status";

/**
 * Tarjeta de cita en la vista de día. SOLO LECTURA: sin acciones (cobrar /
 * editar / cancelar llegan en las Piezas 2 y 3).
 */
export function AppointmentCard({
  appointment,
  zone,
  onSelect,
}: {
  appointment: Appointment;
  zone: string;
  onSelect: (appointment: Appointment) => void;
}) {
  const status = STATUS_STYLES[appointment.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(appointment)}
      className={`flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-left transition hover:border-[#D1D5DB] hover:bg-background ${
        status.dimmed ? "opacity-40" : ""
      }`}
    >
      <span className="w-12 flex-shrink-0 text-sm font-semibold text-brand">
        {formatTime(appointment.startsAt, zone)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {appointment.client.name}
        </p>
        <p className="truncate text-xs text-label">{appointment.service.name}</p>
      </div>
      <span
        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.badge}`}
      >
        {status.label}
      </span>
    </button>
  );
}
