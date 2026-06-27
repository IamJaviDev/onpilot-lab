/** Placeholder de sección: la pantalla de datos llega en una tarea aparte. */
export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="text-sm text-label">Próximamente.</p>
    </div>
  );
}
