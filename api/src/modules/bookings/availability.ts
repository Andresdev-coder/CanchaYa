import { prisma } from "../../config/prisma";
import type { Court } from "../../generated/prisma/client";
import { buildSlots, localToUtc, weekdayOf } from "./slots";

type EstablishmentTz = { id: string; timezone: string };

/** Turnos de una cancha en una fecha: horario de atención + tarifas + reservas existentes. */
export async function slotsFor(
  establishment: EstablishmentTz,
  court: Pick<Court, "id" | "slotMinutes">,
  date: string,
  now = new Date(),
) {
  const weekday = weekdayOf(date);
  const [hours, rules] = await Promise.all([
    prisma.openingHour.findUnique({
      where: { establishmentId_weekday: { establishmentId: establishment.id, weekday } },
    }),
    prisma.priceRule.findMany({ where: { courtId: court.id } }),
  ]);
  if (!hours) return []; // ese día está cerrado

  const dayStart = localToUtc(date, 0, establishment.timezone);
  const dayEnd = localToUtc(date, 1440, establishment.timezone);
  const booked = await prisma.booking.findMany({
    where: {
      courtId: court.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
      // Una reserva "por confirmar" vencida ya no retiene el horario.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { startsAt: true, endsAt: true },
  });

  return buildSlots({
    date,
    timeZone: establishment.timezone,
    hours,
    slotMinutes: court.slotMinutes,
    rules,
    booked,
    now,
  });
}