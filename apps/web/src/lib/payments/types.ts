/** Formas que devuelve/acepta la API real de cobros (ver payments.service.ts). */

export type PaymentMethod = "CASH" | "CARD" | "BIZUM" | "TRANSFER" | "OTHER";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "BIZUM", label: "Bizum" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
];

export type PaymentStatus = "PAID" | "ERROR" | "REFUNDED";

export interface Payment {
  id: string;
  clientId: string;
  appointmentId: string | null;
  serviceId: string | null;
  /** Importes en `number` SOLO para display (convención monetaria del backend). */
  basePrice: number;
  vipDiscountAmount: number;
  manualDiscountAmount: number;
  finalPrice: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

/**
 * Alta de cobro. SIN `finalPrice`: la regla de oro hecha imposible por tipos.
 * El backend calcula VIP y total con Decimal; el front solo aporta el descuento
 * manual (importe en €) y el método de pago.
 */
export interface CreatePaymentPayload {
  clientId: string;
  appointmentId?: string;
  serviceId?: string;
  manualDiscountAmount?: number;
  paymentMethod: PaymentMethod;
}
