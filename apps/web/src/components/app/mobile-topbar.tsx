"use client";

import { LogOut } from "lucide-react";
import { useSession } from "@/lib/auth/session-context";
import { useLogout } from "./use-logout";
import { Wordmark } from "./wordmark";

/** Barra superior compacta de móvil: wordmark + negocio + logout. */
export function MobileTopbar() {
  const { activeBusiness } = useSession();
  const onLogout = useLogout();

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 md:hidden">
      <div className="flex min-w-0 items-baseline gap-2">
        <Wordmark />
        {activeBusiness?.name ? (
          <span className="truncate text-sm text-label">
            · {activeBusiness.name}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Cerrar sesión"
        className="shrink-0 text-label transition hover:text-ink"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
