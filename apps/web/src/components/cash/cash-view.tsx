"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/lib/auth/session-context";
import { useCashSummary } from "@/lib/cash/queries";
import type {
  ByPaymentMethod,
  CashSummary,
  TopService,
} from "@/lib/cash/types";
import { periodBounds, type CashPeriod } from "@/lib/period";
import { formatEur } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments/types";

const PERIOD_TABS: { value: CashPeriod; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "year", label: "Este año" },
];

const METHOD_LABEL = new Map<PaymentMethod, string>(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

export function CashView() {
  const { activeBusiness } = useSession();
  const zone = activeBusiness?.timezone;

  if (!zone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-label">
          No hay un negocio activo para mostrar la caja.
        </p>
      </div>
    );
  }

  return <CashForZone zone={zone} />;
}

function CashForZone({ zone }: { zone: string }) {
  const [period, setPeriod] = useState<CashPeriod>("today");
  const range = useMemo(() => periodBounds(period, zone), [period, zone]);
  const query = useCashSummary(range);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-ink">Caja</h1>

      <div className="flex flex-wrap gap-2">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setPeriod(tab.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              period === tab.value
                ? "border-brand bg-brand text-white"
                : "border-border bg-white text-ink hover:bg-background"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <SummarySkeleton />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.paymentsCount === 0 ? (
        <EmptyState />
      ) : (
        <Summary data={query.data} />
      )}

      <ComingSoonChart />
    </div>
  );
}

function Summary({ data }: { data: CashSummary }) {
  const topService = data.topServices[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Facturado"
          value={formatEur(data.totalRevenue)}
          highlight
        />
        <KpiCard label="Ticket medio" value={formatEur(data.averageTicket)} />
        <KpiCard label="Cobros" value={String(data.paymentsCount)} />
        <KpiCard label="Servicio top" value={topService?.name ?? "—"} small />
      </div>

      {data.errorsCount > 0 ? (
        <p className="text-xs text-label">
          {data.errorsCount}{" "}
          {data.errorsCount === 1
            ? "cobro marcado como error"
            : "cobros marcados como error"}{" "}
          (no cuentan en el total).
        </p>
      ) : null}

      <Breakdown title="Servicios por facturación">
        {data.topServices.map((s) => (
          <TopServiceRow key={s.serviceId ?? s.name ?? "—"} service={s} />
        ))}
      </Breakdown>

      <Breakdown title="Por método de pago">
        {data.byPaymentMethod.map((m) => (
          <MethodRow key={m.paymentMethod} method={m} />
        ))}
      </Breakdown>
    </div>
  );
}

function KpiCard({
  label,
  value,
  highlight = false,
  small = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight ? "border-brand/30 bg-[#E1F5EE]" : "border-border bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-label">
        {label}
      </p>
      <p
        className={`mt-1 font-bold text-ink ${
          small ? "text-sm leading-tight" : "text-xl"
        } ${highlight ? "text-brand-strong" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="divide-y divide-border">{children}</div>
      </div>
    </div>
  );
}

function TopServiceRow({ service }: { service: TopService }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {service.name ?? "Servicio"}
        </p>
        <p className="text-xs text-label">
          {service.count} {service.count === 1 ? "cobro" : "cobros"}
        </p>
      </div>
      <span className="flex-shrink-0 text-sm font-semibold text-ink">
        {formatEur(service.totalRevenue)}
      </span>
    </div>
  );
}

function MethodRow({ method }: { method: ByPaymentMethod }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {METHOD_LABEL.get(method.paymentMethod) ?? method.paymentMethod}
        </p>
        <p className="text-xs text-label">
          {method.count} {method.count === 1 ? "cobro" : "cobros"}
        </p>
      </div>
      <span className="flex-shrink-0 text-sm font-semibold text-ink">
        {formatEur(method.total)}
      </span>
    </div>
  );
}

function ComingSoonChart() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white px-6 py-8 text-center">
      <p className="text-sm font-medium text-label">
        Facturación últimos 6 meses
      </p>
      <p className="mt-1 text-xs text-faint">Próximamente</p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-white px-4 py-3"
        >
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-background" />
          <div className="mt-2 h-5 w-2/3 animate-pulse rounded bg-background" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white px-6 py-12 text-center">
      <p className="text-sm text-label">No se pudo cargar la caja.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-background"
      >
        Reintentar
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-label">
      Sin transacciones en este período.
    </div>
  );
}
