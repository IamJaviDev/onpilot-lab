import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
