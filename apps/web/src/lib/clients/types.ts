/** Formas que devuelve la API real de clientes (ver clients.service.ts). */

import type { AppointmentStatus } from "@/lib/appointments/types";
import type { PaymentMethod } from "@/lib/payments/types";

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isVip: boolean;
  vipDiscountPercent: number;
  tags: string[];
  createdAt: string;
}

/** Stats agregadas del cliente. Importes en number SOLO para display. */
export interface ClientStats {
  totalVisits: number;
  totalSpent: number;
  averageTicket: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
}

/** Servicio embebido en citas/cobros de la ficha. */
export interface ClientServiceRef {
  id: string;
  name: string;
}

/** Item de cita en la ficha (historial y próximas). */
export interface ClientAppointmentItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  service: ClientServiceRef;
}

/** Item de cobro en la ficha. Importes en number SOLO para display. */
export interface ClientPaymentItem {
  id: string;
  basePrice: number;
  vipDiscountAmount: number;
  manualDiscountAmount: number;
  finalPrice: number;
  paymentMethod: PaymentMethod;
  status: "PAID" | "ERROR" | "REFUNDED";
  paidAt: string | null;
  service: ClientServiceRef | null;
}

export interface ClientDetail extends ClientListItem {
  notes: string | null;
  stats: ClientStats;
  /** Historial: citas terminales (COMPLETED/CANCELLED/NO_SHOW), recientes. */
  appointments: ClientAppointmentItem[];
  /** Próximas: citas activas futuras, orden ascendente. */
  upcomingAppointments: ClientAppointmentItem[];
  /** Cobros recientes, orden descendente por paidAt. */
  payments: ClientPaymentItem[];
}

export interface ClientListResponse {
  items: ClientListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface ListClientsParams {
  search?: string;
  page?: number;
  limit?: number;
}

/** Payload de alta/edición (name/phone obligatorios en alta). */
export interface ClientFormPayload {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateVipPayload {
  isVip: boolean;
  vipDiscountPercent: number;
}
