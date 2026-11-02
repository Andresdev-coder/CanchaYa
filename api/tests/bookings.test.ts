import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import {
  addStaff,
  bookableTenant,
  bookingFor,
  bookOnline,
  dayFromNow,
  http,
  ok,
  slotAt,
  type Tenant,
} from "./helpers";

describe("agenda del establecimiento", () => {
  let owner: Tenant;
  let courtId: string;
  const date = dayFromNow(2);

  const reserve = async (time: string, body: object = {}) => {
    const slot = await slotAt(owner.slug, courtId, date, time);
    return ok(await bookOnline(owner.slug, { courtId, start: slot.start, ...body }));
  };

  beforeEach(async () => {
    const t = await bookableTenant();
    owner = t.owner;
    courtId = t.court.id;
  });

  it("lista las reservas del día ordenadas por hora, con cliente y cancha", async () => {
    await reserve("20:00", { name: "Camilo T." });
    await reserve("18:00", { name: "Laura M.", paymentChoice: "DEPOSIT" });

    const res = await http.get(owner.token, `/bookings?date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      status: "PENDING",
      source: "ONLINE",
      paymentChoice: "DEPOSIT",
      price: 90_000,
      customer: { name: "Laura M." },
      court: { id: courtId },
    });
    expect(res.body[1].customer.name).toBe("Camilo T.");
  });

  it("no incluye las canceladas, salvo que se pidan", async () => {
    const booked = await reserve("19:00");
    ok(await http.post(owner.token, `/bookings/${booked.id}/cancel`, { reason: "No contestó" }), 200);

    expect((await http.get(owner.token, `/bookings?date=${date}`)).body).toEqual([]);
    const all = await http.get(owner.token, `/bookings?date=${date}&includeCancelled=true`);
    expect(all.body).toHaveLength(1);
    expect(all.body[0]).toMatchObject({ status: "CANCELLED", cancelReason: "No contestó" });
  });

  it("solo muestra las reservas de ese día", async () => {
    await reserve("19:00");
    expect((await http.get(owner.token, `/bookings?date=${dayFromNow(3)}`)).body).toEqual([]);
  });

  it("confirmar pasa de 'por confirmar' a 'confirmada', y no se puede dos veces (409)", async () => {
    const booked = await reserve("19:00");
    const res = await http.post(owner.token, `/bookings/${booked.id}/confirm`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "CONFIRMED", expiresAt: null });

    const again = await http.post(owner.token, `/bookings/${booked.id}/confirm`, {});
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/confirmada/);
  });

  it("una reserva confirmada también se puede cancelar", async () => {
    const booked = await reserve("19:00");
    ok(await http.post(owner.token, `/bookings/${booked.id}/confirm`, {}), 200);
    const res = await http.post(owner.token, `/bookings/${booked.id}/cancel`, { reason: "Llovió" });
    expect(res.body).toMatchObject({ status: "CANCELLED", cancelReason: "Llovió" });
  });

  it("no se puede confirmar ni cancelar una reserva ya cancelada (409)", async () => {
    const booked = await reserve("19:00");
    ok(await http.post(owner.token, `/bookings/${booked.id}/cancel`, {}), 200);
    expect((await http.post(owner.token, `/bookings/${booked.id}/confirm`, {})).status).toBe(409);
    expect((await http.post(owner.token, `/bookings/${booked.id}/cancel`, {})).status).toBe(409);
  });

  it("una reserva que ya terminó no se puede confirmar ni cancelar (409)", async () => {
    const past = await bookingFor(owner, courtId, "PENDING", new Date(Date.now() - 3 * 3_600_000));
    const confirm = await http.post(owner.token, `/bookings/${past.id}/confirm`, {});
    expect(confirm.status).toBe(409);
    expect(confirm.body.message).toMatch(/terminó/);
    expect((await http.post(owner.token, `/bookings/${past.id}/cancel`, {})).status).toBe(409);
  });

  it("dos confirmaciones simultáneas: solo una pasa", async () => {
    const booked = await reserve("19:00");
    const results = await Promise.all([
      http.post(owner.token, `/bookings/${booked.id}/confirm`, {}),
      http.post(owner.token, `/bookings/${booked.id}/confirm`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("el empleado puede ver, confirmar y cancelar", async () => {
    const staff = await addStaff(owner.establishmentId);
    const a = await reserve("18:00");
    const b = await reserve("19:00");

    expect((await http.get(staff, `/bookings?date=${date}`)).body).toHaveLength(2);
    expect((await http.post(staff, `/bookings/${a.id}/confirm`, {})).status).toBe(200);
    expect((await http.post(staff, `/bookings/${b.id}/cancel`, {})).status).toBe(200);
  });

  it("otro establecimiento no ve ni toca estas reservas (404)", async () => {
    const booked = await reserve("19:00");
    const other = await bookableTenant();

    expect((await http.get(other.owner.token, `/bookings?date=${date}`)).body).toEqual([]);
    expect((await http.get(other.owner.token, `/bookings/${booked.id}`)).status).toBe(404);
    expect((await http.post(other.owner.token, `/bookings/${booked.id}/confirm`, {})).status).toBe(404);
    expect((await http.post(other.owner.token, `/bookings/${booked.id}/cancel`, {})).status).toBe(404);
  });

  it("rechaza una fecha inválida y un id inválido (400), y pide sesión (401)", async () => {
    expect((await http.get(owner.token, "/bookings?date=hoy")).status).toBe(400);
    expect((await http.get(owner.token, "/bookings")).status).toBe(400);
    expect((await http.get(owner.token, "/bookings/no-es-uuid")).status).toBe(400);
    expect((await request(app).get(`/bookings?date=${date}`)).status).toBe(401);
  });
});