"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

/** Cierra sesión y vuelve a /login (comportamiento ya existente en la home). */
export function useLogout() {
  const { logout } = useSession();
  const router = useRouter();
  return async () => {
    await logout();
    router.replace("/login");
  };
}
