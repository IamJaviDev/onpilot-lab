import { dayTabLabel } from "@/lib/appointments/day-range";

/**
 * Fila de 7 tabs (lunes→domingo) de la semana visible. Cada tab: nombre corto +
 * número + punto indicador si el día tiene citas. El día activo va subrayado en
 * verde. Presentacional: no hace fetch, solo emite el día pinchado.
 *
 * `daysWithAppointments` = días con ≥1 cita NO cancelada (las canceladas siguen
 * apareciendo en la lista, pero no encienden el punto).
 */
export function DayTabs({
  days,
  selectedDay,
  daysWithAppointments,
  zone,
  onSelect,
}: {
  days: string[];
  selectedDay: string;
  daysWithAppointments: Set<string>;
  zone: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="flex overflow-x-auto border-b border-border">
      {days.map((day) => {
        const { name, num } = dayTabLabel(day, zone);
        const active = day === selectedDay;
        const hasAppointments = daysWithAppointments.has(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            className={`flex min-w-[44px] flex-1 flex-col items-center gap-0.5 border-b-2 px-1 py-2 transition ${
              active ? "border-brand" : "border-transparent"
            }`}
          >
            <span
              className={`text-[10px] uppercase ${
                active ? "text-brand" : "text-label"
              }`}
            >
              {name}
            </span>
            <span
              className={`text-sm font-semibold ${
                active ? "text-brand" : "text-ink"
              }`}
            >
              {num}
            </span>
            <span
              className={`h-1 w-1 rounded-full ${
                hasAppointments ? "bg-brand" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
