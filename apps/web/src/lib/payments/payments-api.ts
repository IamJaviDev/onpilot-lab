import { apiRequest } from "@/lib/api-client";
import type { CreatePaymentPayload, Payment } from "@/lib/payments/types";

const BASE = "/api/payments";

/** El backend calcula y devuelve el `finalPrice` real (regla de oro). */
export function createPayment(
  payload: CreatePaymentPayload,
): Promise<Payment> {
  return apiRequest<Payment>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
