import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, "Teléfono inválido (solo dígitos, 7 a 15)");

// La dirección web (slug) no se puede cambiar desde aquí: si llega, se ignora.
export const updateEstablishmentSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: phoneSchema.nullable().optional(),
    paymentInstructions: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No hay nada que actualizar" });