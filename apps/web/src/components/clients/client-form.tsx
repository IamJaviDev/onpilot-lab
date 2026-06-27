"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/lib/api-client";
import { Button, Field, FieldError, FormError, Input } from "@/components/ui/form";
import { clientFormSchema, type ClientFormValues } from "@/lib/clients/schemas";
import type { ClientFormPayload } from "@/lib/clients/types";

type Mode = "create" | "edit";

/**
 * En alta, los campos vacíos se omiten (undefined); en edición se envían como
 * null para limpiar el valor (contrato del PATCH del backend).
 */
function buildPayload(values: ClientFormValues, mode: Mode): ClientFormPayload {
  const empty = mode === "create" ? undefined : null;
  const email = values.email?.trim();
  const notes = values.notes?.trim();
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: email ? email : empty,
    notes: notes ? notes : empty,
  };
}

export function ClientForm({
  mode,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  mode: Mode;
  defaultValues?: Partial<ClientFormValues>;
  submitLabel: string;
  onSubmit: (payload: ClientFormPayload) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await onSubmit(buildPayload(values, mode));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setError("phone", {
          message: "Ya existe un cliente con ese teléfono",
        });
        return;
      }
      setFormError("No se pudo guardar. Inténtalo de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoComplete="off" {...register("name")} />
      </Field>
      <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
        <Input id="phone" autoComplete="off" {...register("phone")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="off" {...register("email")} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="notes"
          className="text-xs font-medium uppercase tracking-wide text-label"
        >
          Notas
        </label>
        <textarea
          id="notes"
          rows={3}
          placeholder="Notas de gestión (no datos clínicos)"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          {...register("notes")}
        />
        <FieldError message={errors.notes?.message} />
      </div>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-background disabled:opacity-60"
        >
          Cancelar
        </button>
        <div className="flex-1">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
