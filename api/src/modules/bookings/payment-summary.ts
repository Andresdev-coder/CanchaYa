export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

/** Cuánto se ha pagado de una reserva. Los pagos anulados no cuentan. */
export function summarize(price: number, payments: { amount: number; voidedAt: Date | null }[]) {
  const paid = payments.filter((p) => p.voidedAt === null).reduce((sum, p) => sum + p.amount, 0);
  const balance = price - paid;
  const paymentStatus: PaymentStatus = paid === 0 ? "UNPAID" : balance <= 0 ? "PAID" : "PARTIAL";
  return { paid, balance, paymentStatus };
}