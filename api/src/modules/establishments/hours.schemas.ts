import { z } from "zod";
import { parseTime, timeSchema } from "../../utils/time";

export const setHoursSchema = z
  .object({
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6), // 0 = domingo ... 6 = sábado
          opens: timeSchema,
          closes: timeSchema,
        }),
      )
      .max(7),
  })
  .refine((v) => new Set(v.days.map((d) => d.weekday)).size === v.days.length, {
    message: "Cada día solo puede aparecer una vez",
    path: ["days"],
  })
  .refine((v) => v.days.every((d) => parseTime(d.opens) < parseTime(d.closes)), {
    message: "La hora de apertura debe ser menor que la de cierre",
    path: ["days"],
  });