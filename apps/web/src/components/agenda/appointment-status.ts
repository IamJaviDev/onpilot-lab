import type { AppointmentStatus } from "@/lib/appointments/types";

interface StatusStyle {
  label: string;
  /** Clases Tailwind del badge (fondo + texto). */
  badge: string;
  /** Estados no activos (cancelada/no-show) se muestran atenuados. */
  dimmed: boolean;
}

/** Color por estado (paleta del mockup; canceladas/no-show atenuadas). */
export const STATUS_STYLES: Record<AppointmentStatus, StatusStyle> = {
  CONFIRMED: {
    label: "Confirmada",
    badge: "bg-[#E1F5EE] text-[#085041]",
    dimmed: false,
  },
  SCHEDULED: {
    label: "Pendiente",
    badge: "bg-[#E0F2FE] text-[#075985]",
    dimmed: false,
  },
  COMPLETED: {
    // En esta app COMPLETED solo se alcanza al cobrar → "Cobrada" de cara al
    // usuario (el estado backend sigue siendo COMPLETED).
    label: "Cobrada",
    badge: "bg-[#F0EBE3] text-[#6B6260]",
    dimmed: false,
  },
  CANCELLED: {
    label: "Cancelada",
    badge: "bg-[#FCEBEB] text-[#791F1F]",
    dimmed: true,
  },
  NO_SHOW: {
    label: "No asistió",
    badge: "bg-[#FEF3C7] text-[#92400E]",
    dimmed: true,
  },
};
