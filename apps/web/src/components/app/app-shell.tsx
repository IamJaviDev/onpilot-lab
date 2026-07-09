import { BottomNav } from "./bottom-nav";
import { MobileTopbar } from "./mobile-topbar";
import { Sidebar } from "./sidebar";

/**
 * Carcasa de la zona protegida: sidebar de navegación en desktop, barra +
 * bottom-nav en móvil, con el contenido de la sección en el centro (scroll
 * interno). Columna en móvil (topbar→main→bottom-nav), fila en desktop
 * (sidebar│main).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background md:flex-row">
      <Sidebar />
      <MobileTopbar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
