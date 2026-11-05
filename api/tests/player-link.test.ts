import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import {
  bookableTenant,
  bookingFor,
  dayFromNow,
  http,
  ok,
  prisma,
  reserveOnline,
  slotAt,
  type Tenant,
} from "./helpers";

const view = (token: string) => request(app).get(`/public/bookings/${token}`);
const cancel = (token: string) => request(app).post(`/public/bookings/${token}/cancel`);

describe("enlace privado del jugador", () => {
  let owner: Tenant;
  let courtId: string;
  const date = dayFromNow(2);

  beforeEach(async () => {
    const t = await bookableTenant();
    owner = t.owner;
    courtId = t.court.id;
  });

  describe("ver la reserva", () => {
    it("muestra los datos de su reserva, sin ids internos ni datos de otras personas", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      const res = await view(booked.publicToken);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: "PENDING",
        price: 90_000,
        paymentStatus: "UNPAID",
        amountDue: 0,
        canCancel: true,
        court: { sport: "FOOTBALL" },
        establishment: { slug: owner.slug },
      });
      expect(JSON.stringify(res.body)).not.toContain(booked.id);
      expect(res.body).not.toHaveProperty("customer");
    });

    it("con abono, indica cuánto pagar y cómo; al pagarlo, ya no debe nada", async () => {
      ok(await http.patch(owner.token, "/establishment", { paymentInstructions: "Nequi 310 123 4567" }), 200);
      const booked = await reserveOnline(owner, courtId, date, "19:00", { paymentChoice: "DEPOSIT" });

      const before = await view(booked.publicToken);
      expect(before.body).toMatchObject({ amountDue: 30_000, paymentInstructions: "Nequi 310 123 4567" });

      ok(await http.post(owner.token, `/bookings/${booked.id}/payments`, { amount: 30_000, method: "TRANSFER" }));
      const after = await view(booked.publicToken);
      expect(after.body).toMatchObject({ amountDue: 0, paid: 30_000, paymentStatus: "PARTIAL", canCancel: false });
      expect(after.body.paymentInstructions).toBeNull();
    });

    it("refleja cuando el establecimiento la confirma", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      ok(await http.post(owner.token, `/bookings/${booked.id}/confirm`, {}), 200);
      expect((await view(booked.publicToken)).body.status).toBe("CONFIRMED");
    });

    it("una reserva 'por confirmar' vencida se muestra cancelada", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      await prisma.booking.update({ where: { id: booked.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

      const res = await view(booked.publicToken);
      expect(res.body).toMatchObject({ status: "CANCELLED", cancelReason: "Venció sin confirmar", canCancel: false });
    });

    it("un enlace desconocido da 404 y uno mal formado 400", async () => {
      expect((await view(randomUUID())).status).toBe(404);
      expect((await view("no-es-un-enlace")).status).toBe(400);
    });
  });

  describe("cancelar", () => {
    it("cancela la reserva y libera el turno", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      expect((await slotAt(owner.slug, courtId, date, "19:00")).available).toBe(false);

      const res = await cancel(booked.publicToken);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "CANCELLED", cancelReason: "Cancelada por el jugador", canCancel: false });
      expect((await slotAt(owner.slug, courtId, date, "19:00")).available).toBe(true);
    });

    it("también cancela una reserva ya confirmada", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      ok(await http.post(owner.token, `/bookings/${booked.id}/confirm`, {}), 200);
      expect((await cancel(booked.publicToken)).status).toBe(200);
    });

    it("la agenda del establecimiento la ve cancelada con su motivo", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      ok(await cancel(booked.publicToken), 200);
      const res = await http.get(owner.token, `/bookings?date=${date}&includeCancelled=true`);
      expect(res.body[0]).toMatchObject({ status: "CANCELLED", cancelReason: "Cancelada por el jugador" });
    });

    it("no se puede cancelar dos veces (409)", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      ok(await cancel(booked.publicToken), 200);
      expect((await cancel(booked.publicToken)).status).toBe(409);
    });

    it("si ya hay un pago registrado, debe hablar con el establecimiento (409)", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      ok(await http.post(owner.token, `/bookings/${booked.id}/payments`, { amount: 30_000, method: "CASH" }));

      const res = await cancel(booked.publicToken);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/establecimiento/);
      expect((await view(booked.publicToken)).body.status).toBe("PENDING");
    });

    it("si el pago se anuló, vuelve a poder cancelar", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      const paid = ok(await http.post(owner.token, `/bookings/${booked.id}/payments`, { amount: 30_000, method: "CASH" }));
      ok(
        await http.post(owner.token, `/bookings/${booked.id}/payments/${paid.payments[0].id}/void`, { reason: "Error" }),
        200,
      );
      expect((await cancel(booked.publicToken)).status).toBe(200);
    });

    it("no se puede cancelar un turno que ya empezó (409)", async () => {
      const started = await bookingFor(owner, courtId, "CONFIRMED", new Date(Date.now() - 30 * 60_000));
      const res = await cancel(started.publicToken);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/empezó/);
    });

    it("no se puede cancelar una reserva ya cerrada (409)", async () => {
      const done = await bookingFor(owner, courtId, "COMPLETED", new Date(Date.now() - 180 * 60_000));
      expect((await cancel(done.publicToken)).status).toBe(409);
    });

    it("un enlace desconocido da 404", async () => {
      expect((await cancel(randomUUID())).status).toBe(404);
    });

    it("dos cancelaciones simultáneas: solo una pasa", async () => {
      const booked = await reserveOnline(owner, courtId, date, "19:00");
      const results = await Promise.all([cancel(booked.publicToken), cancel(booked.publicToken)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  it("cada enlace solo da acceso a su propia reserva", async () => {
    const a = await reserveOnline(owner, courtId, date, "18:00");
    const b = await reserveOnline(owner, courtId, date, "19:00");
    ok(await cancel(a.publicToken), 200);
    expect((await view(b.publicToken)).body.status).toBe("PENDING");
  });

  it("la dirección 'bookings' no se confunde con un establecimiento", async () => {
    expect((await request(app).get("/public/bookings")).status).toBe(404);
  });
});