import { z } from "zod";
import { prisma } from "../../config/prisma";
import { formatTime, parseTime } from "../../utils/time";
import { setHoursSchema } from "./hours.schemas";

export async function getHours(establishmentId: string) {
  const rows = await prisma.openingHour.findMany({ where: { establishmentId }, orderBy: { weekday: "asc" } });
  return rows.map((r) => ({ weekday: r.weekday, opens: formatTime(r.opensMin), closes: formatTime(r.closesMin) }));
}

/** Reemplaza todo el horario. Un día que no se envía queda cerrado. */
export async function setHours(establishmentId: string, input: z.infer<typeof setHoursSchema>) {
  await prisma.$transaction([
    prisma.openingHour.deleteMany({ where: { establishmentId } }),
    prisma.openingHour.createMany({
      data: input.days.map((d) => ({
        establishmentId,
        weekday: d.weekday,
        opensMin: parseTime(d.opens),
        closesMin: parseTime(d.closes),
      })),
    }),
  ]);
  return getHours(establishmentId);
}