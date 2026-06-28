import {
  BarChart3,
  Calendar,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Secciones de H1: Inicio (dashboard) · Agenda · Clientes · Caja. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/caja", label: "Caja", icon: BarChart3 },
];

/** Activo si la ruta es exacta o un subpath (p. ej. /clientes/123). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
