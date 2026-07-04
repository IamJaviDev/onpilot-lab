import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Barra de navegación semanal: flechas ± semana, etiqueta de rango y "Hoy".
 * Presentacional: recibe el rango ya formateado y emite callbacks.
 */
export function WeekNav({
  rangeLabel,
  isCurrentWeek,
  onPrev,
  onNext,
  onToday,
}: {
  rangeLabel: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Semana anterior"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Semana siguiente"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-label transition hover:bg-background"
      >
        <ChevronRight size={18} />
      </button>
      <span className="flex-1 text-center text-sm font-medium text-ink">
        {rangeLabel}
      </span>
      <button
        type="button"
        onClick={onToday}
        disabled={isCurrentWeek}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-background disabled:opacity-50"
      >
        Hoy
      </button>
    </div>
  );
}
