"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSession } from "@/lib/auth/session-context";
import { NAV_ITEMS, isActive } from "./nav-items";
import { useLogout } from "./use-logout";
import { Wordmark } from "./wordmark";

/**
 * Cabecera de desktop: wordmark + negocio + logout, y debajo los tabs de
 * sección (estilo d-tabs del mockup: subrayado verde en el activo).
 */
export function DesktopNav() {
  const pathname = usePathname();
  const { activeBusiness } = useSession();
  const onLogout = useLogout();

  return (
    <header className="hidden md:block bg-background">
      <div className="flex items-center justify-between px-6 pt-3">
        <Wordmark />
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-ink">
            {activeBusiness?.name ?? "Sin negocio"}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 text-sm text-label transition hover:text-ink"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </div>
      <nav className="flex gap-1 border-b border-border px-4 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                active
                  ? "border-brand font-medium text-brand"
                  : "border-transparent text-label hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
