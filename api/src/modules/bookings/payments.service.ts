import { z } from "zod";
import { prisma } from "../../config/prisma";
import { AppError } from "../../middlewares/errorHandler";
import { createPaymentSchema } from "./bookings.schemas";
import { get } from "./bookings.service";

/** Registra un pago. El bloqueo de la fila de la reserva evita que dos pagos simultáneos pasen del precio. */
export async function record(
  establishmentId: string,
  userId: string,
  bookingId: string,
  input: z.infer<typeof createPaymentSchema>,
) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ price: number; status: string }[]>`
      SELECT "price", "status"::text AS "status" FROM "Booking"
      WHERE "id" = ${bookingId} AND "establishmentId" = ${establishmentId}
      FOR UPDATE`;
    const booking = rows[0];
    if (!booking) throw new AppError(404, "Reserva no encontrada");
    if (booking.status === "CANCELLED") {
      throw new AppError(409, "No se pueden registrar pagos de una reserva cancelada");
    }

    const { _sum } = await tx.payment.aggregate({
      where: { bookingId, voidedAt: null },
      _sum: { amount: true },
    });
    const balance = booking.price - (_sum.amount ?? 0);
    if (input.amount > balance) {
      throw new AppError(
        409,
        balance === 0 ? "Esta reserva ya está pagada por completo" : `El pago supera lo que falta por pagar (${balance})`,
      );
    }

    await tx.payment.create({
      data: {
        establishmentId,
        bookingId,
        amount: input.amount,
        method: input.method,
        note: input.note,
        recordedById: userId,
      },
    });
  });
  return get(establishmentId, bookingId);
}

/** Los pagos no se borran: se anulan con un motivo y dejan de contar. */
export async function voidPayment(establishmentId: string, bookingId: string, paymentId: string, reason: string) {
  const result = await prisma.payment.updateMany({
    where: { id: paymentId, bookingId, establishmentId, voidedAt: null },
    data: { voidedAt: new Date(), voidReason: reason },
  });
  if (result.count === 0) {
    const exists = await prisma.payment.findFirst({
      where: { id: paymentId, bookingId, establishmentId },
      select: { id: true },
    });
    throw exists ? new AppError(409, "El pago ya está anulado") : new AppError(404, "Pago no encontrado");
  }
  return get(establishmentId, bookingId);
}