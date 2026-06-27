import { z } from "zod";

/** Espejo de Create/UpdateClientDto del backend. */
export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  phone: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio")
    .max(30, "Máximo 30 caracteres"),
  email: z
    .string()
    .trim()
    .max(254, "Máximo 254 caracteres")
    .email("Introduce un email válido")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(2000, "Máximo 2000 caracteres")
    .optional()
    .or(z.literal("")),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
