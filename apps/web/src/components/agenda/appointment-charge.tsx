"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Button, Field, FormError, Input, Select } from "@/components/ui/form";
import { formatEur } from "@/lib/format";
import { useClient } from "@/lib/clients/queries";
import { useCreatePayment } from "@/lib/payments/queries";
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from "@/lib/payments/types";
import type { Appointment } from "@/lib/appointments/types";

const AUTOCLOSE_MS = 1500;

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Esta cita ya está cobrada.";
    if (error.status === 400) {
      if (error.message.toLowerCase().includes("exceed")) {
        return "Los descuentos superan el precio base.";
      }
      return "Revisa los datos del cobro.";
    }
  }
  return "No se pudo cobrar. Inténtalo de nuevo.";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function AppointmentCharge({
  appointment,
  onDone,
}: {
  appointment: Appointment;
  onDone: () => void;
}) {
  const clientQuery = useClient(appointment.client.id);
  const mutation = useCreatePayment();

  const [manualInput, setManualInput] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [formError, setFormError] = useState<string>();
  const [charged, setCharged] = useState<Payment>();

  // --- Previsualización ORIENTATIVA (display). El total vinculante lo calcula
  // el backend con Decimal y llega en la respuesta del cobro. ---
  const base = appointment.service.basePrice;
  const client = clientQuery.data;
  const vipPreview =
    client?.isVip && client.vipDiscountPercent > 0
      ? round2((base * client.vipDiscountPercent) / 100)
      : 0;
  const manual = Math.max(0, Number.parseFloat(manualInput) || 0);
  const totalPreview = round2(base - vipPreview - manual);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    try {
      const payment = await mutation.mutateAsync({
        clientId: appointment.client.id,
        appointmentId: appointment.id,
        manualDiscountAmount: manual > 0 ? manual : undefined,
        paymentMethod: method,
      });
      setCharged(payment); // éxito: el finalPrice REAL del backend
    } catch (error) {
      setFormError(mapError(error)); // error: NO se auto-cierra
    }
  };

  if (charged) {
    return <ChargeSuccess finalPrice={charged.finalPrice} onDone={onDone} />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm">
        <Row label="Precio base" value={formatEur(base)} />
        {vipPreview > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-label">Descuento VIP</span>
            <span className="rounded-full bg-[#E1F5EE] px-2 py-0.5 text-[11px] font-medium text-[#085041]">
              −{client?.vipDiscountPercent}% automático
            </span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium text-ink">Total orientativo</span>
          <span className="text-lg font-bold text-brand">
            {formatEur(totalPreview)}
          </span>
        </div>
        <p className="text-[11px] text-faint">
          Orientativo. El total definitivo lo calcula el sistema al confirmar.
        </p>
      </div>

      <Field label="Descuento adicional (€)" htmlFor="manual">
        <Input
          id="manual"
          type="number"
          min={0}
          step={0.01}
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
        />
      </Field>

      <Field label="Método de pago" htmlFor="method">
        <Select
          id="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Cobrando…" : "Confirmar cobro"}
      </Button>
    </form>
  );
}

/** Éxito breve con el importe REAL del backend; auto-cierre solo en éxito. */
function ChargeSuccess({
  finalPrice,
  onDone,
}: {
  finalPrice: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span className="text-sm text-label">Cobrado</span>
      <span className="text-3xl font-bold text-brand">
        {formatEur(finalPrice)}
      </span>
      <span className="text-xs text-faint">Cita cerrada como cobrada.</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-label">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
