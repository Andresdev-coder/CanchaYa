import { BOOKING } from "../../config/booking";
import { prisma } from "../../config/prisma";
import type { Booking, Court, Customer, Establishment, PaymentChoice } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { slotsFor } from "./availability";
import { checkBookableDate, dateIn } from "./slots";

type Args = {
  establishment: Establishment;
  court: Court;
  /** El inicio exacto de un turno, tal como lo devuelve la disponibilidad. */
  start: Date;
  status: "PENDING" | "CONFIRMED";
  source: "ONLINE" | "MANUAL";
  paymentChoice: PaymentChoice;
  note?: string;
  now: Date;
  /** Se ejecuta después de validar el turno y antes de crear la reserva. */
  getCustomer: () => Promise<Customer>;
};

function isTaken(courtId: string, start: Date, end: Date, now: Date) {
  return prisma.booking
    .count({
      where: {
        courtId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })
    .then((n) => n > 0);
}

/** Crea una reserva. El turno y el precio los decide el servidor: no se confía en lo que mande el cliente. */
export async function reserveSlot(a: Args): Promise<Booking> {
  const timeZone = a.establishment.timezone;
  const date = dateIn(timeZone, a.start);
  const dateError = checkBookableDate(date, timeZone, BOOKING.maxAdvanceDays, a.now);
  if (dateError) throw new AppError(400, dateError);

  const slot = (await slotsFor(a.establishment, a.court, date, a.now)).find(
    (s) => s.start.getTime() === a.start.getTime(),
  );
  if (!slot) throw new AppError(400, "Ese horario no existe o ya pasó");
  if (!slot.available) throw new AppError(409, "Ese horario ya fue reservado");

  const customer = await a.getCustomer();
  const expiresAt =
    a.status === "PENDING"
      ? new Date(Math.min(a.now.getTime() + BOOKING.holdHours * 3_600_000, slot.start.getTime()))
      : null;

  try {
    return await prisma.$transaction(async (tx) => {
      // Libera las reservas "por confirmar" vencidas de esta cancha, que si no seguirían bloqueando el horario.
      await tx.booking.updateMany({
        where: { courtId: a.court.id, status: "PENDING", expiresAt: { lte: a.now } },
        data: { status: "CANCELLED", cancelledAt: a.now, cancelReason: "Venció sin confirmar" },
      });
      return tx.booking.create({
        data: {
          establishmentId: a.establishment.id,
          courtId: a.court.id,
          customerId: customer.id,
          startsAt: slot.start,
          endsAt: slot.end,
          status: a.status,
          source: a.source,
          price: slot.price,
          paymentChoice: a.paymentChoice,
          note: a.note,
          expiresAt,
          confirmedAt: a.status === "CONFIRMED" ? a.now : null,
        },
      });
    });
  } catch (err) {
    // Si dos personas pidieron el mismo turno a la vez, la base de datos rechazó a la segunda.
    if (await isTaken(a.court.id, slot.start, slot.end, a.now)) {
      throw new AppError(409, "Ese horario acaba de ser reservado por otra persona");
    }
    throw err;
  }
}