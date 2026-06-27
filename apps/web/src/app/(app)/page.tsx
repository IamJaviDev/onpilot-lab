"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";
import { Button } from "@/components/auth/ui";

export default function HomePage() {
  const { user, activeBusiness, logout } = useSession();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-label">
          Negocio activo
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {activeBusiness?.name ?? "Sin negocio"}
        </h1>
        <p className="mt-4 text-sm text-label">
          Sesión iniciada como{" "}
          <span className="font-semibold text-foreground">{user?.name}</span>
          {" · "}
          {user?.email}
        </p>
        <div className="mt-8">
          <Button type="button" onClick={onLogout}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </main>
  );
}
