"use client";

import { useMemo, useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/lib/api-client";
import {
  Button,
  Field,
  FieldError,
  FormError,
  Input,
  Label,
  Select,
} from "@/components/ui/form";
import {
  appointmentFormSchema,
  type AppointmentFormValues,
} from "@/lib/appointments/schemas";
import type {
  CreateAppointmentPayload,
  UpdateAppointmentPayload,
} from "@/lib/appointments/types";
import { buildStartsAt } from "@/lib/appointments/day-range";
import { useClientsList } from "@/lib/clients/queries";
import { useServicesList } from "@/lib/services/queries";

interface BaseProps {
  zone: string;
  defaultValues: AppointmentFormValues;
  submitLabel: string;
  onCancel: () => void;
}

type Props = BaseProps &
  (
    | {
        mode: "create";
        onSubmit: (payload: CreateAppointmentPayload) => Promise<unknown>;
      }
    | {
        mode: "edit";
        lockedClient: { id: string; name: string };
        onSubmit: (payload: UpdateAppointmentPayload) => Promise<unknown>;
      }
  );

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/** Traduce los errores del backend a mensajes claros en el formulario. */
function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message.includes("terminal")
        ? "Esta cita ya no se puede editar."
        : "Esa franja horaria ya está ocupada por otra cita.";
    }
    if (error.status === 400) {
      if (error.message.includes("future")) {
        return "No puedes crear una cita en el pasado.";
      }
      if (error.message.includes("Service")) {
        return "El servicio ya no está disponible.";
      }
      if (error.message.includes("Client")) {
        return "El cliente seleccionado no es válido.";
      }
      return "Revisa los datos de la cita.";
    }
  }
  return "No se pudo guardar. Inténtalo de nuevo.";
}

export function AppointmentForm(props: Props) {
  const { zone, defaultValues, submitLabel, onCancel } = props;
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      if (props.mode === "create") {
        const notes = values.notes?.trim();
        await props.onSubmit({
          clientId: values.clientId,
          serviceId: values.serviceId,
          startsAt: buildStartsAt(values.date, values.time, zone),
          notes: notes ? notes : undefined,
        });
      } else {
        // Solo los campos cambiados (dirtyFields): un cambio de solo-notas no
        // reenvía el startsAt antiguo (evita el 400 de "pasado"). clientId nunca.
        const payload: UpdateAppointmentPayload = {};
        if (dirtyFields.serviceId) payload.serviceId = values.serviceId;
        if (dirtyFields.date || dirtyFields.time) {
          payload.startsAt = buildStartsAt(values.date, values.time, zone);
        }
        if (dirtyFields.notes) {
          const notes = values.notes?.trim();
          payload.notes = notes ? notes : null;
        }
        await props.onSubmit(payload);
      }
    } catch (error) {
      setFormError(mapError(error));
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />

      {props.mode === "create" ? (
        <ClientField register={register} error={errors.clientId?.message} />
      ) : (
        <Field label="Cliente" htmlFor="client">
          <Input id="client" value={props.lockedClient.name} disabled />
        </Field>
      )}

      <ServiceField
        register={register}
        error={errors.serviceId?.message}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="date" error={errors.date?.message}>
          <Input id="date" type="date" {...register("date")} />
        </Field>
        <Field label="Hora" htmlFor="time" error={errors.time?.message}>
          <Input id="time" type="time" step={900} {...register("time")} />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          rows={2}
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

/** Selector de cliente (solo en alta; en edición el cliente es inmutable). */
function ClientField({
  register,
  error,
}: {
  register: UseFormRegister<AppointmentFormValues>;
  error?: string;
}) {
  // limit alto + orden por nombre en cliente (GET /clients ordena por createdAt
  // y topa en 100). Deuda: buscador cuando la base crezca.
  const query = useClientsList({ limit: 100 });
  const clients = useMemo(
    () =>
      [...(query.data?.items ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      ),
    [query.data],
  );

  return (
    <Field label="Cliente" htmlFor="clientId" error={error}>
      <Select id="clientId" defaultValue="" disabled={query.isPending} {...register("clientId")}>
        <option value="" disabled>
          {query.isPending ? "Cargando clientes…" : "Selecciona un cliente"}
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {!query.isPending && clients.length === 0 ? (
        <p className="text-xs text-label">Aún no tienes clientes.</p>
      ) : null}
    </Field>
  );
}

/** Selector de servicio activo. Etiqueta "nombre · duración · precio". */
function ServiceField({
  register,
  error,
}: {
  register: UseFormRegister<AppointmentFormValues>;
  error?: string;
}) {
  const query = useServicesList();
  const services = query.data ?? [];

  return (
    <Field label="Servicio" htmlFor="serviceId" error={error}>
      <Select id="serviceId" defaultValue="" disabled={query.isPending} {...register("serviceId")}>
        <option value="" disabled>
          {query.isPending ? "Cargando servicios…" : "Selecciona un servicio"}
        </option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.durationMinutes} min · {eur.format(s.basePrice)}
          </option>
        ))}
      </Select>
      {!query.isPending && services.length === 0 ? (
        <p className="text-xs text-label">Crea un servicio primero.</p>
      ) : null}
    </Field>
  );
}
