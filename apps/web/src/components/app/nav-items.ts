import {
  BarChart3,
  Calendar,
  LayoutDashboard,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Label alternativo para el bottom-nav móvil, donde el espacio aprieta. */
  shortLabel?: string;
  icon: LucideIcon;
}

/** Secciones: Inicio (dashboard) · Agenda · Clientes · Caja · Conversaciones. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/caja", label: "Caja", icon: BarChart3 },
  {
    href: "/conversaciones",
    label: "Conversaciones",
    shortLabel: "Chats",
    icon: MessageCircle,
  },
];

/** Activo si la ruta es exacta o un subpath (p. ej. /clientes/123). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
