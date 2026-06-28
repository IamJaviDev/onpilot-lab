import type { PaymentMethod } from "@/lib/payments/types";

/** Formas que devuelve la API real de caja (ver cash.service.ts). */

export interface ByPaymentMethod {
  paymentMethod: PaymentMethod;
  /** Importes `number` SOLO para display (convención monetaria del backend). */
  total: number;
  count: number;
}

export interface TopService {
  serviceId: string | null;
  name: string | null;
  totalRevenue: number;
  count: number;
}

export interface CashSummary {
  totalRevenue: number;
  paymentsCount: number;
  averageTicket: number;
  byPaymentMethod: ByPaymentMethod[];
  topServices: TopService[];
  errorsCount: number;
}

/** Rango sobre `paidAt`. Instantes ISO con offset, en la zona del negocio. */
export interface CashSummaryParams {
  from: string;
  to: string;
}
