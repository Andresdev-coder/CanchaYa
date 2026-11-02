import { z } from "zod";

export const listBookingsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)"),
  includeCancelled: z.enum(["true", "false"]).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});