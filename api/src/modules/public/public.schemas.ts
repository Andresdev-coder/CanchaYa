import { z } from "zod";
import { mobilePhoneSchema } from "../../utils/phone";

export const slugParam = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "Dirección inválida");

export const availabilityQuerySchema = z.object({
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)"),
});

export const createPublicBookingSchema = z.object({
  courtId: z.string().uuid(),
  /** El inicio exacto del turno, tal como lo devolvió la disponibilidad. */
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(80),
  phone: mobilePhoneSchema,
  paymentChoice: z.enum(["AT_COURT", "DEPOSIT", "FULL"]).default("AT_COURT"),
  note: z.string().trim().max(200).optional(),
});