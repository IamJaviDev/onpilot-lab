/** Formas que devuelve la API real de servicios (ver services.service.ts). */

export interface Service {
  id: string;
  name: string;
  description: string | null;
  /** Numérico SOLO para display (convención monetaria del backend). */
  basePrice: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface ListServicesParams {
  includeInactive?: boolean;
}
