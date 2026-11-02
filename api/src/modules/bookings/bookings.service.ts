import { z } from "zod";
import { prisma } from "../../config/prisma";
import type { Booking, BookingStatus, Sport } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { isRealDate, localToUtc } from "./slots";
import { cancelBookingSchema } from "./bookings.schemas";

type Row = Booking & {
  court: { id: string; name: string; sport: Sport };
  customer: { id: string; name: string; phone: string };
};

const include = {
  court: { select: { id: true, name: true, sport: true } },
  customer: { select: { id: true, name: true, phone: true } },
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