"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/auth/session-context";
import {
  BUSINESS_SECTORS,
  registerBusinessSchema,
  type RegisterBusinessInput,
} from "@/lib/auth/schemas";
import {
  Button,
  Field,
  FormError,
  Input,
  Select,
} from "@/components/auth/ui";

export function RegisterBusinessForm() {
  const { register: registerBusiness } = useSession();
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterBusinessInput>({
    resolver: zodResolver(registerBusinessSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await registerBusiness(values);
      router.replace("/");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError("Ese email ya está registrado.");
        return;
      }
      setFormError("No se pudo crear el negocio. Inténtalo de nuevo.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormError message={formError} />
      <Field
        label="Nombre del negocio"
        htmlFor="businessName"
        error={errors.businessName?.message}
      >
        <Input id="businessName" {...register("businessName")} />
      </Field>
      <Field
        label="Tu nombre"
        htmlFor="ownerName"
        error={errors.ownerName?.message}
      >
        <Input id="ownerName" autoComplete="name" {...register("ownerName")} />
      </Field>
      <Field label="Sector" htmlFor="sector" error={errors.sector?.message}>
        <Select id="sector" defaultValue="" {...register("sector")}>
          <option value="" disabled>
            Selecciona un sector
          </option>
          {BUSINESS_SECTORS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Ciudad (opcional)"
        htmlFor="city"
        error={errors.city?.message}
      >
        <Input id="city" {...register("city")} />
      </Field>
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
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creando…" : "Crear negocio"}
      </Button>
      <p className="text-center text-sm text-label">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-brand">
          Entrar
        </Link>
      </p>
    </form>
  );
}
