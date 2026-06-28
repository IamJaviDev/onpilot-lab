import { apiRequest } from "@/lib/api-client";
import type {
  Appointment,
  CreateAppointmentPayload,
  ListAppointmentsParams,
  UpdateAppointmentPayload,
} from "@/lib/appointments/types";

const BASE = "/api/appointments";

/** Todas las llamadas pasan por apiRequest (Bearer + refresh single-flight). */

/** GET /api/appointments devuelve un array pelado (no envuelto en {items}). */
export function listAppointments(
  params: ListAppointmentsParams,
): Promise<Appointment[]> {
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  return apiRequest<Appointment[]>(`${BASE}?${qs.toString()}`);
}

export function getAppointment(id: string): Promise<Appointment> {
  return apiRequest<Appointment>(`${BASE}/${id}`);
}

export function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<Appointment> {
  return apiRequest<Appointment>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAppointment(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<Appointment> {
  return apiRequest<Appointment>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
