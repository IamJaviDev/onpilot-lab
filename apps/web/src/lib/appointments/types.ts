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

/**
 * Alta de cita. `startsAt` es ISO-8601 CON offset de la zona del negocio; el
 * backend calcula `endsAt` desde la duración del servicio y fija status/source.
 */
export interface CreateAppointmentPayload {
  clientId: string;
  serviceId: string;
  startsAt: string;
  notes?: string;
}

/**
 * Edición de cita. `clientId` es inmutable (no va en el PATCH). Solo se envían
 * los campos que cambian; `notes: null` limpia las notas.
 */
export interface UpdateAppointmentPayload {
  serviceId?: string;
  startsAt?: string;
  notes?: string | null;
}

/** Cancelación: motivo opcional (texto de gestión, máx 500). */
export interface CancelAppointmentPayload {
  reason?: string;
}
