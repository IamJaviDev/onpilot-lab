"use client";

import { useState } from "react";
import { useUpdateClientVip } from "@/lib/clients/queries";
import type { ClientDetail } from "@/lib/clients/types";

/**
 * VIP: una mutación limpia por acción.
 * - Alternar el switch → un solo PATCH (mantiene el % actual).
 * - Editar el % → un solo PATCH al perder el foco, y solo si cambió.
 * Mientras hay una mutación en vuelo se deshabilitan los controles, evitando
 * carreras y parpadeo; el % local se resincroniza tras la invalidación.
 */
export function VipToggle({ client }: { client: ClientDetail }) {
  const mutation = useUpdateClientVip(client.id);
  const [percent, setPercent] = useState(client.vipDiscountPercent);

  // Resincroniza el % local cuando cambia el valor del servidor (tras la
  // invalidación), ajustando estado durante el render (patrón recomendado por
  // React, sin efecto que dispare renders en cascada).
  const [syncedPercent, setSyncedPercent] = useState(client.vipDiscountPercent);
  if (syncedPercent !== client.vipDiscountPercent) {
    setSyncedPercent(client.vipDiscountPercent);
    setPercent(client.vipDiscountPercent);
  }

  const pending = mutation.isPending;

  const toggle = () => {
    if (pending) return;
    mutation.mutate({
      isVip: !client.isVip,
      vipDiscountPercent: client.vipDiscountPercent,
    });
  };

  const commitPercent = () => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
    setPercent(clamped);
    if (clamped === client.vipDiscountPercent) return;
    mutation.mutate({ isVip: true, vipDiscountPercent: clamped });
  };

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-ink">Cliente VIP</div>
          <div className="text-xs text-label">
            Descuento fijo aplicado al cobrar
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={client.isVip}
          aria-label="Cliente VIP"
          onClick={toggle}
          disabled={pending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
            client.isVip ? "bg-brand" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              client.isVip ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {client.isVip ? (
        <div className="mt-4 flex items-center gap-2">
          <label
            htmlFor="vip-pct"
            className="text-xs font-medium uppercase tracking-wide text-label"
          >
            Descuento
          </label>
          <input
            id="vip-pct"
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            onBlur={commitPercent}
            disabled={pending}
            className="w-20 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand disabled:opacity-60"
          />
          <span className="text-sm text-label">%</span>
        </div>
      ) : null}
    </div>
  );
}
