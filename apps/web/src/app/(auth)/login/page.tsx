import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-foreground">Entrar</h2>
      <LoginForm />
    </div>
  );
}
