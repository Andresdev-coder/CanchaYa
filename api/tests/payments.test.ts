import { beforeEach, describe, expect, it } from "vitest";
import { addStaff, bookableTenant, dayFromNow, http, ok, prisma, reserveOnline, type Tenant } from "./helpers";
import { randomUUID } from "node:crypto";

describe("pagos de una reserva", () => {
  let owner: Tenant;
  let courtId: string;
  let bookingId: string;
  const date = dayFromNow(2);

  // La reserva de las 7 pm cuesta 90.000.
  beforeEach(async () => {
    const t = await bookableTenant();
    owner = t.owner;
    courtId = t.court.id;
    bookingId = (await reserveOnline(owner, courtId, date, "19:00")).id;
  });

  const pay = (body: object, token = owner.token, id = bookingId) => http.post(token, `/bookings/${id}/payments`, body);
  const voidPay = (paymentId: string, body: object = { reason: "Error de digitación" }, token = owner.token) =>
    http.post(token, `/bookings/${bookingId}/payments/${paymentId}/void`, body);

  it("un abono y luego el resto dejan la reserva pagada", async () => {
    const first = await pay({ amount: 30_000, method: "TRANSFER", note: "Nequi" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ paid: 30_000, balance: 60_000, paymentStatus: "PARTIAL" });
    expect(first.body.payments[0]).toMatchObject({ amount: 30_000, method: "TRANSFER", note: "Nequi", voided: false });

    const second = await pay({ amount: 60_000, method: "CASH" });
    expect(second.body).toMatchObject({ paid: 90_000, balance: 0, paymentStatus: "PAID" });
    expect(second.body.payments).toHaveLength(2);
  });

  it("una reserva sin pagos está 'sin pagar'", async () => {
    const res = await http.get(owner.token, `/bookings/${bookingId}`);
    expect(res.body).toMatchObject({ paid: 0, balance: 90_000, paymentStatus: "UNPAID", payments: [] });
  });

  it("se puede registrar un pago aunque la reserva siga 'por confirmar'", async () => {
    const res = await pay({ amount: 30_000, method: "TRANSFER" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  it("no se puede pagar más de lo que falta (409)", async () => {
    ok(await pay({ amount: 60_000, method: "CASH" }));
    const res = await pay({ amount: 30_001, method: "CASH" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/30000/);

    ok(await pay({ amount: 30_000, method: "CASH" }));
    const paidOff = await pay({ amount: 1, method: "CASH" });
    expect(paidOff.status).toBe(409);
    expect(paidOff.body.message).toMatch(/pagada por completo/);
  });

  it.each([
    ["un valor de 0", { amount: 0, method: "CASH" }],
    ["un valor negativo", { amount: -5, method: "CASH" }],
    ["un valor con decimales", { amount: 1000.5, method: "CASH" }],
    ["un método inexistente", { amount: 1000, method: "TARJETA" }],
    ["sin método", { amount: 1000 }],
  ])("rechaza un pago con %s (400)", async (_caso, body) => {
    expect((await pay(body)).status).toBe(400);
  });

  it("no se registran pagos de una reserva cancelada (409)", async () => {
    ok(await http.post(owner.token, `/bookings/${bookingId}/cancel`, {}), 200);
    expect((await pay({ amount: 10_000, method: "CASH" })).status).toBe(409);
  });

  it("cinco pagos de 30.000 simultáneos: solo caben tres", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => pay({ amount: 30_000, method: "CASH" })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409]);

    const res = await http.get(owner.token, `/bookings/${bookingId}`);
    expect(res.body).toMatchObject({ paid: 90_000, balance: 0 });
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(3);
  });

  describe("anular", () => {
    it("el pago anulado deja de contar, se conserva y se puede volver a pagar", async () => {
      const created = await pay({ amount: 90_000, method: "CASH" });
      const paymentId = created.body.payments[0].id;

      const res = await voidPay(paymentId, { reason: "Se equivocó de reserva" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ paid: 0, balance: 90_000, paymentStatus: "UNPAID" });
      expect(res.body.payments[0]).toMatchObject({ voided: true, voidReason: "Se equivocó de reserva" });

      expect((await pay({ amount: 90_000, method: "TRANSFER" })).status).toBe(201);
    });

    it("exige un motivo (400) y no se puede anular dos veces (409)", async () => {
      const paymentId = (await pay({ amount: 10_000, method: "CASH" })).body.payments[0].id;
      expect((await voidPay(paymentId, { reason: "ab" })).status).toBe(400);
      ok(await voidPay(paymentId), 200);
      expect((await voidPay(paymentId)).status).toBe(409);
    });

    it("solo el dueño anula (403 al empleado) y un pago inexistente da 404", async () => {
      const staff = await addStaff(owner.establishmentId);
      const paymentId = (await pay({ amount: 10_000, method: "CASH" })).body.payments[0].id;
      expect((await voidPay(paymentId, { reason: "Prueba" }, staff)).status).toBe(403);
      expect((await voidPay(randomUUID())).status).toBe(404);
    });
  });

  it("el empleado puede registrar pagos", async () => {
    const staff = await addStaff(owner.establishmentId);
    const res = await pay({ amount: 30_000, method: "CASH" }, staff);
    expect(res.status).toBe(201);
  });

  it("la agenda muestra cuánto se ha pagado de cada reserva", async () => {
    ok(await pay({ amount: 30_000, method: "TRANSFER" }));
    const res = await http.get(owner.token, `/bookings?date=${date}`);
    expect(res.body[0]).toMatchObject({ paid: 30_000, balance: 60_000, paymentStatus: "PARTIAL" });
  });

  it("otro establecimiento no puede ver ni tocar estos pagos (404)", async () => {
    const paymentId = (await pay({ amount: 10_000, method: "CASH" })).body.payments[0].id;
    const other = await bookableTenant();
    expect((await pay({ amount: 10_000, method: "CASH" }, other.owner.token)).status).toBe(404);
    expect((await voidPay(paymentId, { reason: "Intruso" }, other.owner.token)).status).toBe(404);
  });
});