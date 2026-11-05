import { z } from "zod";
import { BOOKING } from "../../config/booking";
import { prisma } from "../../config/prisma";
import type { Booking, Court, Establishment } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { formatTime } from "../../utils/time";
import { slotsFor } from "../bookings/availability";
import { findOrCreateCustomer } from "../bookings/customers";
import { reserveSlot } from "../bookings/reserve";
import { checkBookableDate } from "../bookings/slots";
import { createPublicBookingSchema } from "./public.schemas";
import type { Payment } from "../../generated/prisma/client";
import { summarize } from "../bookings/payment-summary";

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

  const booking = await reserveSlot({
    establishment,
    court,
    start: new Date(input.start),
    status: "PENDING",
    source: "ONLINE",
    paymentChoice: input.paymentChoice,
    note: input.note,
    now,
    getCustomer: async () => {
      const known = await prisma.customer.findUnique({
        where: { establishmentId_phone: { establishmentId: establishment.id, phone: input.phone } },
      });
      if (known && (await countActive(known.id, now)) >= BOOKING.maxActivePerPhone) {
        throw new AppError(
          409,
          `Ya tienes ${BOOKING.maxActivePerPhone} reservas activas. Espera a que las confirmen o cancélalas.`,
        );
      }
      return known ?? (await findOrCreateCustomer(establishment.id, input.name, input.phone));
    },
  });

  return toDto(booking, court, establishment);
}

type PlayerRow = Booking & { court: Court; establishment: Establishment; payments: Payment[] };

const playerInclude = { court: true, establishment: true, payments: true } as const;

function toPlayerDto(b: PlayerRow, now: Date) {
  const { paid, balance, paymentStatus } = summarize(b.price, b.payments);
  const active = b.status === "PENDING" || b.status === "CONFIRMED";
  const deposit = b.court.depositAmount === null ? 0 : Math.min(b.court.depositAmount, b.price);
  const target = b.paymentChoice === "FULL" ? b.price : b.paymentChoice === "DEPOSIT" ? deposit : 0;
  const amountDue = active ? Math.max(target - paid, 0) : 0;

  return {
    status: b.status,
    paymentChoice: b.paymentChoice,
    price: b.price,
    paid,
    balance,
    paymentStatus,
    amountDue,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    expiresAt: b.expiresAt?.toISOString() ?? null,
    cancelReason: b.cancelReason,
    court: { name: b.court.name, sport: b.court.sport },
    establishment: { slug: b.establishment.slug, name: b.establishment.name, phone: b.establishment.phone },
    // Solo se muestran mientras falte algo por pagar por adelantado.
    paymentInstructions: amountDue > 0 ? b.establishment.paymentInstructions : null,
    canCancel: active && b.startsAt > now && paid === 0,
  };
}

export async function getByToken(token: string, now = new Date()) {
  // Si la reserva estaba "por confirmar" y ya venció, se cancela al abrirla.
  await prisma.booking.updateMany({
    where: { publicToken: token, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Venció sin confirmar" },
  });

  const booking = await prisma.booking.findUnique({ where: { publicToken: token }, include: playerInclude });
  if (!booking) throw new AppError(404, "Reserva no encontrada");
  return toPlayerDto(booking, now);
}

export async function cancelByToken(token: string, now = new Date()) {
  // Una sola actualización con todas las condiciones: así no se cancela algo que cambió justo antes.
  const result = await prisma.booking.updateMany({
    where: {
      publicToken: token,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gt: now },
      payments: { none: { voidedAt: null } },
    },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Cancelada por el jugador" },
  });

  const booking = await prisma.booking.findUnique({ where: { publicToken: token }, include: playerInclude });
  if (!booking) throw new AppError(404, "Reserva no encontrada");

  if (result.count === 0) {
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      throw new AppError(409, "Esta reserva ya no se puede cancelar");
    }
    if (booking.startsAt <= now) throw new AppError(409, "El turno ya empezó");
    throw new AppError(
      409,
      "Ya hay pagos registrados en esta reserva. Comunícate con el establecimiento para cancelarla.",
    );
  }
  return toPlayerDto(booking, now);
}