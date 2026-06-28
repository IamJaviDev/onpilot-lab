import { useQuery } from "@tanstack/react-query";
import { listAppointments } from "@/lib/appointments/appointments-api";
import type { ListAppointmentsParams } from "@/lib/appointments/types";

/** Convención de keys: invalidar `all` cubre cualquier rango/día. */
export const appointmentKeys = {
  all: ["appointments"] as const,
  list: (params: ListAppointmentsParams) =>
    ["appointments", "list", params] as const,
};

export function useAppointmentsList(params: ListAppointmentsParams) {
  return useQuery({
    queryKey: appointmentKeys.list(params),
    queryFn: () => listAppointments(params),
  });
}
