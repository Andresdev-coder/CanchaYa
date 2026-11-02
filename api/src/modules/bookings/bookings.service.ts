import { z } from "zod";
import { prisma } from "../../config/prisma";
import type { Booking, BookingStatus, Payment, Sport } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { cancelBookingSchema, createManualBookingSchema } from "./bookings.schemas";
import { findOrCreateCustomer } from "./customers";
import { summarize } from "./payment-summary";
import { reserveSlot } from "./reserve";
import { isRealDate, localToUtc } from "./slots";

type Row = Booking & {
  court: { id: string; name: string; sport: Sport };
  customer: { id: string; name: string; phone: string };
  payments: Payment[];
};

const include = {
  court: { select: { id: true, name: true, sport: true } },
  customer: { select: { id: true, name: true, phone: true } },
  payments: { orderBy: { createdAt: "asc" } },
} as const;

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "por confirmar",
  CONFIRMED: "confirmada",
  CANCELLED: "cancelada",
  NO_SHOW: "marcada como no asistió",
  COMPLETED: "completada",
};

function toDto(b: Row) {
  return {
    id: b.id,
    status: b.status,
    source: b.source,
    paymentChoice: b.paymentChoice,
    price: b.price,
    ...summarize(b.price, b.payments),
    payments: b.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      voided: p.voidedAt !== null,
      voidReason: p.voidReason,
    })),
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    note: b.note,
    expiresAt: b.expiresAt?.toISOString() ?? null,
    cancelReason: b.cancelReason,
    createdAt: b.createdAt.toISOString(),
    court: b.court,
    customer: b.customer,
  };
}

export async function listDay(establishmentId: string, date: string, includeCancelled: boolean) {
  if (!isRealDate(date)) throw new AppError(400, "Fecha inválida");
  const { timezone } = await prisma.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
    select: { timezone: true },
  });

  // Las reservas "por confirmar" que nadie atendió y ya vencieron se cancelan, para que la agenda no las muestre.
  const now = new Date();
  await prisma.booking.updateMany({
    where: { establishmentId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Venció sin confirmar" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      establishmentId,
      startsAt: { gte: localToUtc(date, 0, timezone), lt: localToUtc(date, 1440, timezone) },
      ...(includeCancelled ? {} : { status: { not: "CANCELLED" } }),
    },
    include,
    orderBy: [{ startsAt: "asc" }, { court: { name: "asc" } }],
  });
  return bookings.map(toDto);
}

export async function get(establishmentId: string, id: string) {
  const booking = await prisma.booking.findFirst({ where: { id, establishmentId }, include });
  if (!booking) throw new AppError(404, "Reserva no encontrada");
  return toDto(booking);
}

/** Reserva que el dueño o el empleado crea cuando le llaman por teléfono: nace confirmada. */
export async function createManual(establishmentId: string, input: z.infer<typeof createManualBookingSchema>) {
  const establishment = await prisma.establishment.findUniqueOrThrow({ where: { id: establishmentId } });
  const court = await prisma.court.findFirst({ where: { id: input.courtId, establishmentId, active: true } });
  if (!court) throw new AppError(404, "Cancha no encontrada");

  const booking = await reserveSlot({
    establishment,
    court,
    start: new Date(input.start),
    status: "CONFIRMED",
    source: "MANUAL",
    paymentChoice: "AT_COURT",
    note: input.note,
    now: new Date(),
    getCustomer: () => findOrCreateCustomer(establishmentId, input.name, input.phone),
  });
  return get(establishmentId, booking.id);
}

async function explainFailure(establishmentId: string, id: string, action: string): Promise<never> {
  const booking = await prisma.booking.findFirst({
    where: { id, establishmentId },
    select: { status: true, endsAt: true },
  });
  if (!booking) throw new AppError(404, "Reserva no encontrada");
  if (booking.endsAt <= new Date()) throw new AppError(409, "Esa reserva ya terminó");
  throw new AppError(409, `No se puede ${action} una reserva ${STATUS_LABEL[booking.status]}`);
}

/** De "por confirmar" a "confirmada". La condición en la actualización evita que dos personas la confirmen a la vez. */
export async function confirm(establishmentId: string, id: string) {
  const result = await prisma.booking.updateMany({
    where: { id, establishmentId, status: "PENDING", endsAt: { gt: new Date() } },
    data: { status: "CONFIRMED", confirmedAt: new Date(), expiresAt: null },
  });
  if (result.count === 0) await explainFailure(establishmentId, id, "confirmar");
  return get(establishmentId, id);
}

export async function cancel(establishmentId: string, id: string, input: z.infer<typeof cancelBookingSchema>) {
  const result = await prisma.booking.updateMany({
    where: { id, establishmentId, status: { in: ["PENDING", "CONFIRMED"] }, endsAt: { gt: new Date() } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason ?? null },
  });
  if (result.count === 0) await explainFailure(establishmentId, id, "cancelar");
  return get(establishmentId, id);
}

/** Cierra una reserva confirmada que ya empezó: jugaron ("completada") o no llegaron ("no asistió"). */
export async function finish(establishmentId: string, id: string, status: "NO_SHOW" | "COMPLETED") {
  const result = await prisma.booking.updateMany({
    where: { id, establishmentId, status: "CONFIRMED", startsAt: { lte: new Date() } },
    data: { status },
  });
  if (result.count === 0) {
    const booking = await prisma.booking.findFirst({ where: { id, establishmentId }, select: { status: true } });
    if (!booking) throw new AppError(404, "Reserva no encontrada");
    if (booking.status !== "CONFIRMED") {
      throw new AppError(409, `Solo se puede cerrar una reserva confirmada (esta está ${STATUS_LABEL[booking.status]})`);
    }
    throw new AppError(409, "La reserva aún no empieza");
  }
  return get(establishmentId, id);
}