"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

/**
 * Layout de las pantallas públicas de auth. Si ya hay sesión, redirige a la
 * home protegida (evita ver login/registro estando autenticado).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand">Onpilot</h1>
          <p className="mt-1 text-sm text-label">
            El negocio en piloto automático.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
