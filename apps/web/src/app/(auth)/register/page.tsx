import { RegisterBusinessForm } from "@/components/auth/register-business-form";

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-foreground">Crear negocio</h2>
      <RegisterBusinessForm />
    </div>
  );
}
