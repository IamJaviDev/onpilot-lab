/** Formas que devuelve la API real del dashboard de H1 (ver dashboard.service.ts). */

/** Tipo local (no acoplado a lib/cash) aunque el shape coincida. */
export interface TopService {
  serviceId: string | null;
  name: string | null;
  /** Importes `number` SOLO para display (convención monetaria del backend). */
  totalRevenue: number;
  count: number;
}

export interface DashboardH1 {
  todayAppointments: number;
  upcomingAppointments: number;
  todayRevenue: number;
  monthRevenue: number;
  newClientsThisMonth: number;
  averageTicket: number;
  topServices: TopService[];
  /** Conteo de clientes candidatos a reactivación (no lista). */
  clientsToReactivate: number;
}
