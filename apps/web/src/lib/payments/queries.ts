import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentKeys } from "@/lib/appointments/queries";
import { createPayment } from "@/lib/payments/payments-api";
import type { CreatePaymentPayload } from "@/lib/payments/types";

/** Cobrar marca la cita COMPLETED en el backend → refrescar la agenda. */
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) => createPayment(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
