import { z } from "zod";

const password = z.string().min(8, "Mínimo 8 caracteres").max(72);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
    /** Restablece la contraseña del empleado y cierra sus sesiones abiertas. */
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No hay nada que actualizar" });
