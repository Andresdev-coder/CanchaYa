import { z } from "zod";
import { mobilePhoneSchema } from "../../utils/phone";

export const listBookingsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)"),
  includeCancelled: z.enum(["true", "false"]).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const createManualBookingSchema = z.object({
  courtId: z.string().uuid(),
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(80),
  phone: mobilePhoneSchema,
  note: z.string().trim().max(200).optional(),
});

export const createPaymentSchema = z.object({
  amount: z.number().int().min(1).max(100_000_000),
  method: z.enum(["CASH", "TRANSFER"]),
  note: z.string().trim().max(200).optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo").max(200),
});