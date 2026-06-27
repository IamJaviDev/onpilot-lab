import { z } from "zod";

/** Sectores de negocio (espejo del enum BusinessSector del backend). */
export const BUSINESS_SECTORS = [
  { value: "BEAUTY", label: "Estética" },
  { value: "PHYSIO", label: "Fisioterapia" },
  { value: "PSYCHOLOGY", label: "Psicología" },
  { value: "NUTRITION", label: "Nutrición" },
  { value: "DENTAL", label: "Dental" },
  { value: "FITNESS", label: "Fitness" },
  { value: "OTHER", label: "Otro" },
] as const;

const sectorValues = BUSINESS_SECTORS.map((s) => s.value) as [
  string,
  ...string[],
];

export const loginSchema = z.object({
  email: z.string().email("Introduce un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerBusinessSchema = z.object({
  businessName: z
    .string()
    .min(1, "El nombre del negocio es obligatorio")
    .max(200),
  ownerName: z.string().min(1, "Tu nombre es obligatorio").max(200),
  email: z.string().email("Introduce un email válido").max(254),
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(128),
  city: z.string().max(120).optional().or(z.literal("")),
  sector: z.enum(sectorValues, {
    message: "Selecciona un sector",
  }),
});

export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;
