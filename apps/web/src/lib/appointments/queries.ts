import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAppointment,
  getAppointment,
  listAppointments,
  updateAppointment,
} from "@/lib/appointments/appointments-api";
import type {
  CreateAppointmentPayload,
  ListAppointmentsParams,
  UpdateAppointmentPayload,
} from "@/lib/appointments/types";

/** Convención de keys: invalidar `all` cubre cualquier rango/día y el detalle. */
export const appointmentKeys = {
  all: ["appointments"] as const,
  list: (params: ListAppointmentsParams) =>
    ["appointments", "list", params] as const,
  detail: (id: string) => ["appointments", "detail", id] as const,
};

export function useAppointmentsList(params: ListAppointmentsParams) {
  return useQuery({
    queryKey: appointmentKeys.list(params),
    queryFn: () => listAppointments(params),
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: () => getAppointment(id),
    enabled: Boolean(id),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      createAppointment(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useUpdateAppointment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAppointmentPayload) =>
      updateAppointment(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
