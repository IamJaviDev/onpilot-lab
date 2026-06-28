"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/auth/session-context";
import { useAppointmentsList } from "@/lib/appointments/queries";
import {
  dayBounds,
  formatDayLabel,
  isToday,
  shiftDay,
  todayInZone,
} from "@/lib/appointments/day-range";
import { AppointmentCard } from "./appointment-card";

export function AgendaView() {
  const { activeBusiness } = useSession();
  const zone = activeBusiness?.timezone;

  if (!zone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-label">
          No hay un negocio activo para mostrar la agenda.
        </p>
      </div>
    );
  }

  return <AgendaForZone zone={zone} />;
}

/** Separado para inicializar el día una vez conocida la zona del negocio. */
function AgendaForZone({ zone }: { zone: string }) {
  const [day, setDay] = useState(() => todayInZone(zone));

  const range = useMemo(() => dayBounds(day, zone), [day, zone]);
  const query = useAppointmentsList(range);

  const items = query.data ?? [];
  const onToday = isToday(day, zone);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-ink">Agenda</h1>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDay((d) => shiftDay(d, -1, zone))}
          aria-label="Día anterior"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setDay((d) => shiftDay(d, 1, zone))}
          aria-label="Día siguiente"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={() => setDay(todayInZone(zone))}
          disabled={onToday}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-background disabled:opacity-50"
        >
          Hoy
        </button>
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.target.value) setDay(e.target.value);
          }}
          className="ml-auto rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <p className="text-sm font-medium text-label">
        {formatDayLabel(day, zone)}
      </p>

      <div className="flex flex-col gap-2">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              zone={zone}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5"
        >
          <div className="h-4 w-12 animate-pulse rounded bg-background" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-background" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-background" />
          </div>
        </div>
      ))}
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white px-6 py-12 text-center">
      <p className="text-sm text-label">No se pudieron cargar las citas.</p>
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
      Sin citas este día.
    </div>
  );
}
