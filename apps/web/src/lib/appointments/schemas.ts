import { z } from "zod";

/**
 * Formulario de cita (alta y edición). La validación de "no en pasado" se delega
 * al backend (fuente de verdad) y se mensajea claro en el formulario; aquí solo
 * exigimos que los campos estén completos y bien formados.
 */
export const appointmentFormSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  serviceId: z.string().min(1, "Selecciona un servicio"),
  date: z.string().min(1, "Selecciona una fecha"),
  time: z.string().min(1, "Selecciona una hora"),
  notes: z.string().max(2000, "Máximo 2000 caracteres").optional(),
});

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
