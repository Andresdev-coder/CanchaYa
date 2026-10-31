import { z } from "zod";
import { phoneSchema } from "../establishments/establishments.schemas";

export const registerSchema = z.object({
  establishmentName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  phone: phoneSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});