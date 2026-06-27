"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-context";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";
import { Button, Field, FormError, Input } from "@/components/ui/form";

export function LoginForm() {
  const { login } = useSession();
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await login(values);
      router.replace("/");
    } catch {
      // Error genérico: no revelar si falla el email o la contraseña.
      setFormError("Email o contraseña incorrectos.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormError message={formError} />
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </Field>
      <Field
        label="Contraseña"
        htmlFor="password"
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-label">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-semibold text-brand">
          Crear negocio
        </Link>
      </p>
    </form>
  );
}
