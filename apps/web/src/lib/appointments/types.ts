/** Formas que devuelve la API real de citas (ver appointments.service.ts). */

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type AppointmentSource = "MANUAL" | "WHATSAPP" | "IMPORT" | "SYSTEM";

export interface AppointmentClient {
  id: string;
  name: string;
  phone: string;
}

export interface AppointmentService {
  id: string;
  name: string;
  /** Numérico SOLO para display (convención monetaria del backend). */
  basePrice: number;
}

export interface Appointment {
  id: string;
  client: AppointmentClient;
  service: AppointmentService;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

/**
 * Filtros de listado. `from`/`to` son instantes ISO (UTC) que acotan el día
 * seleccionado en la zona del negocio; el backend filtra `startsAt` con gte/lte.
 */
export interface ListAppointmentsParams {
  from: string;
  to: string;
}
