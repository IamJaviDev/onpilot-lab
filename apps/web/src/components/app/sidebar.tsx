"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSession } from "@/lib/auth/session-context";
import { NAV_ITEMS, isActive } from "./nav-items";
import { useLogout } from "./use-logout";
import { Wordmark } from "./wordmark";

/**
 * Rail lateral de navegación (solo desktop, ≥md): negocio arriba, las secciones
 * en el centro, logout abajo. Colapsable a iconos; el estado vive en memoria y
 * sobrevive a la navegación porque el shell se monta una vez en el layout.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { activeBusiness } = useSession();
  const onLogout = useLogout();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-border bg-background md:flex ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Cabecera: wordmark + negocio */}
      <div
        className={`flex min-h-14 items-center gap-2 px-4 py-3 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        {collapsed ? (
          <span className="text-lg font-bold tracking-tight text-brand">o</span>
        ) : (
          <div className="flex min-w-0 flex-col">
            <Wordmark />
            <span className="truncate text-xs text-label">
              {activeBusiness?.name ?? "Sin negocio"}
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-brand/10 font-medium text-brand"
                  : "text-label hover:bg-[var(--g100)] hover:text-ink"
              }`}
            >
              <Icon size={20} className="shrink-0" />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Pie: colapsar + logout */}
      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expandir" : "Colapsar"}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-label transition hover:bg-[var(--g100)] hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} className="shrink-0" />
          ) : (
            <>
              <PanelLeftClose size={20} className="shrink-0" />
              <span className="truncate">Colapsar</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-label transition hover:bg-[var(--g100)] hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut size={20} className="shrink-0" />
          {collapsed ? null : <span className="truncate">Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
