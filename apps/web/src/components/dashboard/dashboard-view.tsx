"use client";

import { useDashboardH1 } from "@/lib/dashboard/queries";
import type { DashboardH1, TopService } from "@/lib/dashboard/types";
import { formatEur } from "@/lib/format";

export function DashboardView() {
  const query = useDashboardH1();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-extrabold text-ink">Inicio</h1>

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (
        <Dashboard data={query.data} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: DashboardH1 }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Facturado este mes"
          value={formatEur(data.monthRevenue)}
          highlight
        />
        <KpiCard label="Facturado hoy" value={formatEur(data.todayRevenue)} />
        <KpiCard label="Citas hoy" value={String(data.todayAppointments)} />
        <KpiCard
          label="Próximas citas"
          value={String(data.upcomingAppointments)}
          subtitle="activas futuras"
        />
        <KpiCard
          label="Clientes nuevos (mes)"
          value={String(data.newClientsThisMonth)}
        />
        <KpiCard label="Ticket medio" value={formatEur(data.averageTicket)} />
        <KpiCard
          label="Clientes a reactivar"
          value={String(data.clientsToReactivate)}
          subtitle="sin cita futura, +60 días"
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.8px] text-faint">
          Servicios top del mes
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {data.topServices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-label">
              Sin servicios cobrados este mes.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {data.topServices.map((s) => (
                <TopServiceRow key={s.serviceId ?? s.name ?? "—"} service={s} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta KPI reutilizable. Pensada para crecer (más KPIs/herramientas en el
 * futuro centro de mando): label + valor + subtítulo opcional + variante hl.
 */
function KpiCard({
  label,
  value,
  subtitle,
  highlight = false,
}: {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? "border-transparent bg-[linear-gradient(135deg,#1D9E75_0%,#0a5c42_100%)] shadow-[0_6px_20px_rgba(29,158,117,0.35)]"
          : "border-border bg-white"
      }`}
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.6px] ${
          highlight ? "text-white/80" : "text-label"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-extrabold leading-none ${
          highlight ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </p>
      {subtitle ? (
        <p
          className={`mt-0.5 text-xs ${
            highlight ? "text-white/70" : "text-faint"
          }`}
        >
          {subtitle}
        </p>
      ) : null}
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

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
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
      <p className="text-sm text-label">No se pudo cargar el panel.</p>
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
