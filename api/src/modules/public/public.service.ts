import { z } from "zod";
import { BOOKING } from "../../config/booking";
import { prisma } from "../../config/prisma";
import type { Booking, Court, Establishment } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { formatTime } from "../../utils/time";
import { slotsFor } from "../bookings/availability";
import { checkBookableDate, dateIn } from "../bookings/slots";
import { createPublicBookingSchema } from "./public.schemas";

const isUnique = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

async function findEstablishment(slug: string) {
  const establishment = await prisma.establishment.findUnique({ where: { slug } });
  if (!establishment) throw new AppError(404, "Establecimiento no encontrado");
  return establishment;
}

async function findCourt(establishmentId: string, courtId: string) {
  const court = await prisma.court.findFirst({ where: { id: courtId, establishmentId, active: true } });
  if (!court) throw new AppError(404, "Cancha no encontrada");
  return court;
}

export async function getPage(slug: string) {
  const establishment = await findEstablishment(slug);
  const courts = await prisma.court.findMany({
    where: { establishmentId: establishment.id, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return {
    establishment: {
      slug: establishment.slug,
      name: establishment.name,
      city: establishment.city,
      phone: establishment.phone,
    },
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      sport: c.sport,
      surface: c.surface,
      slotMinutes: c.slotMinutes,
      allowDeposit: c.allowDeposit,
      depositAmount: c.depositAmount,
      allowFullPayment: c.allowFullPayment,
    })),
  };
}

export async function availability(slug: string, courtId: string, date: string, now = new Date()) {
  const establishment = await findEstablishment(slug);
  const court = await findCourt(establishment.id, courtId);

  const error = checkBookableDate(date, establishment.timezone, BOOKING.maxAdvanceDays, now);
  if (error) throw new AppError(400, error);

  const slots = await slotsFor(establishment, court, date, now);
  return {
    date,
    court: { id: court.id, name: court.name, sport: court.sport, slotMinutes: court.slotMinutes },
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      startTime: formatTime(s.startMin),
      endTime: formatTime(s.endMin),
      price: s.price,
      available: s.available,
    })),
  };
}

async function findOrCreateCustomer(establishmentId: string, name: string, phone: string) {
  const where = { establishmentId_phone: { establishmentId, phone } };
  const existing = await prisma.customer.findUnique({ where });
  if (existing) return existing; // se respeta el nombre que ya tiene
  try {
    return await prisma.customer.create({ data: { establishmentId, name, phone } });
  } catch (err) {
    if (isUnique(err)) return prisma.customer.findUniqueOrThrow({ where }); // otra petición lo creó a la vez
    throw err;
  }
}

function countActive(customerId: string, now: Date) {
  return prisma.booking.count({
    where: {
      customerId,
      status: { in: ["PENDING", "CONFIRMED"] },
      endsAt: { gt: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

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

function toDto(booking: Booking, court: Court, establishment: Establishment) {
  const deposit = court.depositAmount === null ? null : Math.min(court.depositAmount, booking.price);
  const amountDue =
    booking.paymentChoice === "FULL" ? booking.price : booking.paymentChoice === "DEPOSIT" ? deposit : 0;
  return {
    id: booking.id,
    publicToken: booking.publicToken,
    status: booking.status,
    paymentChoice: booking.paymentChoice,
    price: booking.price,
    amountDue,
    start: booking.startsAt.toISOString(),
    end: booking.endsAt.toISOString(),
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    court: { id: court.id, name: court.name, sport: court.sport },
    establishment: { slug: establishment.slug, name: establishment.name, phone: establishment.phone },
    // Solo se muestran cuando el jugador va a pagar por adelantado.
    paymentInstructions: booking.paymentChoice === "AT_COURT" ? null : establishment.paymentInstructions,
  };
}

export async function createBooking(
  slug: string,
  input: z.infer<typeof createPublicBookingSchema>,
  now = new Date(),
) {
  const establishment = await findEstablishment(slug);
  const court = await findCourt(establishment.id, input.courtId);

  if (input.paymentChoice === "DEPOSIT" && !court.allowDeposit) {
    throw new AppError(400, "Esta cancha no recibe abonos");
  }
  if (input.paymentChoice === "FULL" && !court.allowFullPayment) {
    throw new AppError(400, "Esta cancha no recibe el pago total por adelantado");
  }

  // El turno se valida contra el que calcula el servidor: no se confía en la hora ni en el precio del cliente.
  const start = new Date(input.start);
  const date = dateIn(establishment.timezone, start);
  const dateError = checkBookableDate(date, establishment.timezone, BOOKING.maxAdvanceDays, now);
  if (dateError) throw new AppError(400, dateError);

  const slot = (await slotsFor(establishment, court, date, now)).find((s) => s.start.getTime() === start.getTime());
  if (!slot) throw new AppError(400, "Ese horario no existe o ya pasó");
  if (!slot.available) throw new AppError(409, "Ese horario ya fue reservado");

  const known = await prisma.customer.findUnique({
    where: { establishmentId_phone: { establishmentId: establishment.id, phone: input.phone } },
  });
  if (known && (await countActive(known.id, now)) >= BOOKING.maxActivePerPhone) {
    throw new AppError(409, `Ya tienes ${BOOKING.maxActivePerPhone} reservas activas. Espera a que las confirmen o cancélalas.`);
  }
  const customer = known ?? (await findOrCreateCustomer(establishment.id, input.name, input.phone));

  const expiresAt = new Date(Math.min(now.getTime() + BOOKING.holdHours * 3_600_000, slot.start.getTime()));

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Libera las reservas "por confirmar" vencidas de esta cancha, que si no seguirían bloqueando el horario.
      await tx.booking.updateMany({
        where: { courtId: court.id, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Venció sin confirmar" },
      });
      return tx.booking.create({
        data: {
          establishmentId: establishment.id,
          courtId: court.id,
          customerId: customer.id,
          startsAt: slot.start,
          endsAt: slot.end,
          status: "PENDING",
          source: "ONLINE",
          price: slot.price,
          paymentChoice: input.paymentChoice,
          note: input.note,
          expiresAt,
        },
      });
    });
    return toDto(booking, court, establishment);
  } catch (err) {
    // Si dos personas pidieron el mismo turno a la vez, la base de datos rechazó a la segunda.
    if (await isTaken(court.id, slot.start, slot.end, now)) {
      throw new AppError(409, "Ese horario acaba de ser reservado por otra persona");
    }
    throw err;
  }
}