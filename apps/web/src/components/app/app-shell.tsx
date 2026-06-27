import { BottomNav } from "./bottom-nav";
import { DesktopNav } from "./desktop-nav";
import { MobileTopbar } from "./mobile-topbar";

/**
 * Carcasa de la zona protegida: tabs superiores en desktop, barra + bottom-nav
 * en móvil, con el contenido de la sección en el centro (scroll interno).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <DesktopNav />
      <MobileTopbar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
