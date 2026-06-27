import { ProtectedRoute } from "@/components/auth/protected-route";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
