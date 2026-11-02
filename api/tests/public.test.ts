import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import {
  allWeek,
  bookableTenant,
  bookOnline,
  createCourt,
  dayFromNow,
  http,
  ok,
  prisma,
  registerTenant,
  slotAt,
} from "./helpers";

const availability = (slug: string, query: object) => request(app).get(`/public/${slug}/availability`).query(query);

describe("página pública", () => {
  it("devuelve el establecimiento y sus canchas activas, sin datos de pago", async () => {
    const { owner, court } = await bookableTenant();
    ok(await http.patch(owner.token, "/establishment", { paymentInstructions: "Nequi 310 123 4567" }), 200);

    const res = await request(app).get(`/public/${owner.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.establishment).toMatchObject({ slug: owner.slug, city: "Yopal" });
    expect(res.body.courts).toHaveLength(1);
    expect(res.body.courts[0]).toMatchObject({ id: court.id, allowDeposit: true, depositAmount: 30_000 });
    expect(JSON.stringify(res.body)).not.toContain("Nequi");
  });

  it("no muestra las canchas inactivas", async () => {
    const { owner, court } = await bookableTenant();
    ok(await http.patch(owner.token, `/courts/${court.id}`, { active: false }), 200);
    expect((await request(app).get(`/public/${owner.slug}`)).body.courts).toEqual([]);
  });

  it("una dirección inexistente da 404, y una con caracteres raros 400", async () => {
    expect((await request(app).get("/public/no-existe-este-lugar")).status).toBe(404);
    expect((await request(app).get("/public/Mala%20Direcci%C3%B3n")).status).toBe(400);
  });
});

describe("disponibilidad", () => {
  it("ofrece los 16 turnos del día con precio de día y de noche, todos libres", async () => {
    const { owner, court } = await bookableTenant();
    const date = dayFromNow(2);
    const res = await availability(owner.slug, { courtId: court.id, date });
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(16);
    expect(res.body.slots[0]).toMatchObject({ startTime: "06:00", endTime: "07:00", price: 70_000, available: true });
    expect(res.body.slots[13]).toMatchObject({ startTime: "19:00", price: 90_000 });
    expect(res.body.slots.every((s: { available: boolean }) => s.available)).toBe(true);
  });

  it("un día sin horario de atención no tiene turnos", async () => {
    const { owner, court } = await bookableTenant();
    ok(await http.put(owner.token, "/establishment/hours", { days: [] }), 200);
    const res = await availability(owner.slug, { courtId: court.id, date: dayFromNow(2) });
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it("un turno con tarifa solo hasta las 5 pm no ofrece la noche", async () => {
    const { owner, court } = await bookableTenant();
    ok(
      await http.put(owner.token, `/courts/${court.id}/prices`, {
        rules: [{ weekdays: allWeek, start: "06:00", end: "17:00", pricePerHour: 70_000 }],
      }),
      200,
    );
    const res = await availability(owner.slug, { courtId: court.id, date: dayFromNow(2) });
    expect(res.body.slots).toHaveLength(11);
  });

  it.each([
    ["ayer", () => dayFromNow(-1)],
    ["dentro de 60 días", () => dayFromNow(60)],
    ["una fecha inexistente", () => "2026-02-30"],
    ["un texto", () => "mañana"],
  ])("rechaza %s (400)", async (_caso, date) => {
    const { owner, court } = await bookableTenant();
    expect((await availability(owner.slug, { courtId: court.id, date: date() })).status).toBe(400);
  });

  it("una cancha de otro establecimiento da 404", async () => {
    const mine = await bookableTenant();
    const other = await bookableTenant();
    const res = await availability(mine.owner.slug, { courtId: other.court.id, date: dayFromNow(2) });
    expect(res.status).toBe(404);
  });
});

describe("reservar como jugador", () => {
  it("crea la reserva 'por confirmar' con el precio del servidor y ocupa el turno", async () => {
    const { owner, court } = await bookableTenant();
    const date = dayFromNow(2);
    const slot = await slotAt(owner.slug, court.id, date, "19:00");

    const res = await bookOnline(owner.slug, { courtId: court.id, start: slot.start });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "PENDING",
      paymentChoice: "AT_COURT",
      price: 90_000,
      amountDue: 0,
      start: slot.start,
      paymentInstructions: null,
    });
    expect(res.body.publicToken).toEqual(expect.any(String));
    expect(new Date(res.body.expiresAt).getTime()).toBeLessThanOrEqual(new Date(slot.start).getTime());

    expect((await slotAt(owner.slug, court.id, date, "19:00")).available).toBe(false);
    expect((await slotAt(owner.slug, court.id, date, "20:00")).available).toBe(true);
  });

  it("el mismo turno no se puede reservar dos veces (409)", async () => {
    const { owner, court } = await bookableTenant();
    const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
    ok(await bookOnline(owner.slug, { courtId: court.id, start: slot.start }));
    const again = await bookOnline(owner.slug, { courtId: court.id, start: slot.start });
    expect(again.status).toBe(409);
  });

  it("10 peticiones simultáneas por el mismo turno: solo una pasa y el resto recibe 409", async () => {
    const { owner, court } = await bookableTenant();
    const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => bookOnline(owner.slug, { courtId: court.id, start: slot.start })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    expect(await prisma.booking.count({ where: { courtId: court.id } })).toBe(1);
  });

  it("rechaza una hora que no es el inicio de un turno (400)", async () => {
    const { owner, court } = await bookableTenant();
    const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
    const crooked = new Date(new Date(slot.start).getTime() + 30 * 60_000).toISOString();
    expect((await bookOnline(owner.slug, { courtId: court.id, start: crooked })).status).toBe(400);
  });

  it("rechaza un turno que ya pasó (400)", async () => {
    const { owner, court } = await bookableTenant();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect((await bookOnline(owner.slug, { courtId: court.id, start: yesterday })).status).toBe(400);
  });

  it("una cancha de otro establecimiento da 404", async () => {
    const mine = await bookableTenant();
    const other = await bookableTenant();
    const slot = await slotAt(other.owner.slug, other.court.id, dayFromNow(2), "19:00");
    const res = await bookOnline(mine.owner.slug, { courtId: other.court.id, start: slot.start });
    expect(res.status).toBe(404);
  });

  it.each([
    ["sin nombre", { name: "" }, "name"],
    ["con un teléfono que no es celular", { phone: "6081234567" }, "phone"],
    ["con un teléfono con letras", { phone: "abc" }, "phone"],
    ["con una forma de pago inexistente", { paymentChoice: "BITCOIN" }, "paymentChoice"],
  ])("rechaza una reserva %s (400)", async (_caso, change, field) => {
    const { owner, court } = await bookableTenant();
    const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
    const res = await bookOnline(owner.slug, { courtId: court.id, start: slot.start, ...change });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  describe("forma de pago", () => {
    it("con abono, informa cuánto pagar y cómo", async () => {
      const { owner, court } = await bookableTenant();
      ok(await http.patch(owner.token, "/establishment", { paymentInstructions: "Nequi 310 123 4567" }), 200);
      const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");

      const res = await bookOnline(owner.slug, { courtId: court.id, start: slot.start, paymentChoice: "DEPOSIT" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ paymentChoice: "DEPOSIT", amountDue: 30_000, paymentInstructions: "Nequi 310 123 4567" });
    });

    it("el abono nunca supera el precio del turno", async () => {
      const { owner, court } = await bookableTenant();
      ok(await http.patch(owner.token, `/courts/${court.id}`, { depositAmount: 500_000 }), 200);
      const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
      const res = await bookOnline(owner.slug, { courtId: court.id, start: slot.start, paymentChoice: "DEPOSIT" });
      expect(res.body.amountDue).toBe(90_000);
    });

    it("pagando todo, debe el precio completo", async () => {
      const { owner, court } = await bookableTenant();
      const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
      const res = await bookOnline(owner.slug, { courtId: court.id, start: slot.start, paymentChoice: "FULL" });
      expect(res.body).toMatchObject({ paymentChoice: "FULL", amountDue: 90_000 });
    });

    it("rechaza el abono o el pago total si la cancha no los permite (400)", async () => {
      const { owner, court } = await bookableTenant();
      ok(await http.patch(owner.token, `/courts/${court.id}`, { allowDeposit: false, allowFullPayment: false }), 200);
      const slot = await slotAt(owner.slug, court.id, dayFromNow(2), "19:00");
      expect((await bookOnline(owner.slug, { courtId: court.id, start: slot.start, paymentChoice: "DEPOSIT" })).status).toBe(400);
      expect((await bookOnline(owner.slug, { courtId: court.id, start: slot.start, paymentChoice: "FULL" })).status).toBe(400);
    });
  });

  describe("el jugador", () => {
    it("el mismo celular, escrito de varias formas, es el mismo cliente, y se conserva su nombre", async () => {
      const { owner, court } = await bookableTenant();
      const date = dayFromNow(2);
      const first = await slotAt(owner.slug, court.id, date, "18:00");
      const second = await slotAt(owner.slug, court.id, date, "19:00");

      ok(await bookOnline(owner.slug, { courtId: court.id, start: first.start, name: "Andrés R.", phone: "310 555 0001" }));
      ok(await bookOnline(owner.slug, { courtId: court.id, start: second.start, name: "Otro nombre", phone: "+57 3105550001" }));

      const customers = await prisma.customer.findMany({ where: { establishmentId: owner.establishmentId } });
      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({ name: "Andrés R.", phone: "3105550001" });
    });

    it("un mismo teléfono puede tener hasta 3 reservas activas (409 a la cuarta)", async () => {
      const { owner, court } = await bookableTenant();
      const date = dayFromNow(3);
      const phone = "3105550002";

      for (const time of ["17:00", "18:00", "19:00"]) {
        const slot = await slotAt(owner.slug, court.id, date, time);
        ok(await bookOnline(owner.slug, { courtId: court.id, start: slot.start, phone }));
      }
      const fourth = await slotAt(owner.slug, court.id, date, "20:00");
      const res = await bookOnline(owner.slug, { courtId: court.id, start: fourth.start, phone });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/3 reservas activas/);

      // Otro teléfono sí puede reservar ese turno.
      expect((await bookOnline(owner.slug, { courtId: court.id, start: fourth.start })).status).toBe(201);
    });
  });

  describe("el turno se libera", () => {
    it("cuando la reserva se cancela", async () => {
      const { owner, court } = await bookableTenant();
      const date = dayFromNow(2);
      const slot = await slotAt(owner.slug, court.id, date, "19:00");
      const booked = ok(await bookOnline(owner.slug, { courtId: court.id, start: slot.start }));

      ok(await http.post(owner.token, `/bookings/${booked.id}/cancel`, {}), 200);
      expect((await slotAt(owner.slug, court.id, date, "19:00")).available).toBe(true);
      expect((await bookOnline(owner.slug, { courtId: court.id, start: slot.start })).status).toBe(201);
    });

    it("cuando una reserva 'por confirmar' vence sin que nadie la atienda", async () => {
      const { owner, court } = await bookableTenant();
      const date = dayFromNow(2);
      const slot = await slotAt(owner.slug, court.id, date, "19:00");
      const first = ok(await bookOnline(owner.slug, { courtId: court.id, start: slot.start }));

      await prisma.booking.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

      expect((await slotAt(owner.slug, court.id, date, "19:00")).available).toBe(true);
      expect((await bookOnline(owner.slug, { courtId: court.id, start: slot.start })).status).toBe(201);

      const expired = await prisma.booking.findUniqueOrThrow({ where: { id: first.id } });
      expect(expired).toMatchObject({ status: "CANCELLED", cancelReason: "Venció sin confirmar" });
    });
  });

  it("una reserva confirmada no vence nunca", async () => {
    const { owner, court } = await bookableTenant();
    const date = dayFromNow(2);
    const slot = await slotAt(owner.slug, court.id, date, "19:00");
    const booked = ok(await bookOnline(owner.slug, { courtId: court.id, start: slot.start }));
    const confirmed = ok(await http.post(owner.token, `/bookings/${booked.id}/confirm`, {}), 200);
    expect(confirmed.expiresAt).toBeNull();
    expect((await slotAt(owner.slug, court.id, date, "19:00")).available).toBe(false);
  });

  it("dos establecimientos pueden vender la misma hora sin estorbarse", async () => {
    const a = await bookableTenant();
    const b = await bookableTenant();
    const date = dayFromNow(2);
    for (const t of [a, b]) {
      const slot = await slotAt(t.owner.slug, t.court.id, date, "19:00");
      expect((await bookOnline(t.owner.slug, { courtId: t.court.id, start: slot.start })).status).toBe(201);
    }
  });

  it("registrarTenant y createCourt siguen funcionando para el resto de las pruebas", async () => {
    const tenant = await registerTenant();
    expect((await createCourt(tenant.token)).id).toEqual(expect.any(String));
  });
});