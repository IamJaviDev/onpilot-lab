"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

/** Pantalla de carga mínima mientras se resuelve la sesión. */
function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-label">
      Cargando…
    </div>
  );
}

/**
 * Guarda client-side: la cookie del refresh es httpOnly y path-scoped, así que
 * la protección vive en React (no en middleware). Sin sesión → /login.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "authenticated") {
    return <>{children}</>;
  }
  return <FullScreenLoader />;
}
