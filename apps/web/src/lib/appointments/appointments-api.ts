import { apiRequest } from "@/lib/api-client";
import type { Appointment, ListAppointmentsParams } from "@/lib/appointments/types";

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
