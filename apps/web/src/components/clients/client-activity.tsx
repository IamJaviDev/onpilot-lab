"use client";

import { STATUS_STYLES } from "@/components/agenda/appointment-status";
import { PAYMENT_METHODS } from "@/lib/payments/types";
import { formatEur } from "@/lib/format";
import type {
  ClientAppointmentItem,
  ClientDetail,
  ClientPaymentItem,
} from "@/lib/clients/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentMethodLabel(method: ClientPaymentItem["paymentMethod"]): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        highlight ? "border-brand/30 bg-[#E1F5EE]" : "border-border bg-white"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-label">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-bold text-ink ${
          highlight ? "text-brand-strong" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ClientAppointmentItem["status"] }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
    >
      {style.label}
    </span>
  );
}

function AppointmentRow({
  appointment,
}: {
  appointment: ClientAppointmentItem;
}) {
  const style = STATUS_STYLES[appointment.status];
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2 ${
        style.dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">
          {appointment.service.name}
        </div>
        <div className="text-xs text-label">
          {formatDateTime(appointment.startsAt)}
        </div>
      </div>
      <StatusBadge status={appointment.status} />
    </div>
  );
}

function PaymentRow({ payment }: { payment: ClientPaymentItem }) {
  const dimmed = payment.status !== "PAID";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">
          {payment.service?.name ?? "Cobro"}
        </div>
        <div className="text-xs text-label">
          {payment.paidAt ? formatDate(payment.paidAt) : "Sin fecha"} ·{" "}
          {paymentMethodLabel(payment.paymentMethod)}
          {payment.status === "ERROR" && " · Error"}
          {payment.status === "REFUNDED" && " · Reembolsado"}
        </div>
      </div>
      <div className="shrink-0 text-sm font-semibold text-ink">
        {formatEur(payment.finalPrice)}
      </div>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-faint">{children}</p>;
}

export function ClientActivity({ client }: { client: ClientDetail }) {
  const { stats, upcomingAppointments, appointments, payments } = client;

  return (
    <div className="flex flex-col gap-5">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Visitas totales" value={String(stats.totalVisits)} />
        <StatCard
          label="Gasto total"
          value={formatEur(stats.totalSpent)}
          highlight
        />
        <StatCard label="Ticket medio" value={formatEur(stats.averageTicket)} />
        <StatCard
          label="Última visita"
          value={stats.lastVisitAt ? formatDate(stats.lastVisitAt) : "—"}
        />
      </div>

      {/* Próximas citas */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Próximas citas</SectionLabel>
        {upcomingAppointments.length > 0 ? (
          upcomingAppointments.map((a) => (
            <AppointmentRow key={a.id} appointment={a} />
          ))
        ) : (
          <EmptyLine>Sin citas próximas.</EmptyLine>
        )}
      </div>

      {/* Historial de citas */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Historial de citas</SectionLabel>
        {appointments.length > 0 ? (
          appointments.map((a) => <AppointmentRow key={a.id} appointment={a} />)
        ) : (
          <EmptyLine>Aún no hay citas registradas.</EmptyLine>
        )}
      </div>

      {/* Historial de cobros */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Historial de cobros</SectionLabel>
        {payments.length > 0 ? (
          payments.map((p) => <PaymentRow key={p.id} payment={p} />)
        ) : (
          <EmptyLine>Aún no hay cobros registrados.</EmptyLine>
        )}
      </div>
    </div>
  );
}
