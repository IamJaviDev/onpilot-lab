"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Bottom-nav de móvil (mockup m-bottom-nav): icono + label, activo en verde. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex border-t border-border bg-white md:hidden"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 px-1 pt-2 pb-1 text-[10px] font-medium transition ${
              active ? "text-brand" : "text-faint"
            }`}
          >
            <Icon size={22} />
            <span>{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
