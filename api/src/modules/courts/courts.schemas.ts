import { z } from "zod";
import { parseTime, timeSchema } from "../../utils/time";

const base = z.object({
  name: z.string().trim().min(1).max(40),
  sport: z.enum(["FOOTBALL", "VOLLEYBALL", "TENNIS", "OTHER"]),
  surface: z.string().trim().max(60).nullable().optional(),
  slotMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  allowDeposit: z.boolean(),
  depositAmount: z.number().int().min(1).max(100_000_000).nullable().optional(),
  allowFullPayment: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

// Al crear, estos campos tienen un valor por defecto.
export const createCourtSchema = base
  .omit({ active: true })
  .extend({
    slotMinutes: base.shape.slotMinutes.default(60),
    allowDeposit: base.shape.allowDeposit.default(true),
    allowFullPayment: base.shape.allowFullPayment.default(true),
    sortOrder: base.shape.sortOrder.default(0),
  })
  .refine((v) => !v.allowDeposit || v.depositAmount != null, {
    message: "Indica el valor del abono",
    path: ["depositAmount"],
  });

// Al editar, ningún campo se rellena solo: lo que no llega, no se toca.
export const updateCourtSchema = base
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay nada que actualizar" });

export const listCourtsSchema = z.object({
  includeInactive: z.enum(["true", "false"]).optional(),
});

const priceRule = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: timeSchema,
  end: timeSchema,
  pricePerHour: z.number().int().min(1).max(10_000_000),
});

type RuleInput = z.infer<typeof priceRule>;

/** Dos franjas se cruzan si, un mismo día, una empieza antes de que termine la anterior. */
function overlaps(rules: RuleInput[]) {
  for (let day = 0; day <= 6; day++) {
    const spans = rules
      .filter((r) => r.weekdays.includes(day))
      .map((r) => [parseTime(r.start), parseTime(r.end)])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] < spans[i - 1][1]) return true;
    }
  }
  return false;
}

export const setPricesSchema = z
  .object({ rules: z.array(priceRule).max(30) })
  .refine((v) => v.rules.every((r) => parseTime(r.start) < parseTime(r.end)), {
    message: "En cada franja, la hora de inicio debe ser menor que la de fin",
    path: ["rules"],
  })
  .refine((v) => !overlaps(v.rules), {
    message: "Hay franjas que se cruzan el mismo día",
    path: ["rules"],
  });