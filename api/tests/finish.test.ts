import { beforeEach, describe, expect, it } from "vitest";
import {
  addStaff,
  bookableTenant,
  bookingFor,
  dayFromNow,
  http,
  prisma,
  reserveOnline,
  type Tenant,
} from "./helpers";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

describe("cierre del partido", () => {
  let owner: Tenant;
  let courtId: string;

  beforeEach(async () => {
    const t = await bookableTenant();
    owner = t.owner;
    courtId = t.court.id;
  });

  const action = (id: string, name: "complete" | "no-show", token = owner.token) =>
    http.post(token, `/bookings/${id}/${name}`, {});

  it("una reserva confirmada que ya empezó se puede marcar como completada", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesAgo(30));
    const res = await action(booking.id, "complete");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
  });

  it("también como 'no asistió'", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesAgo(30));
    const res = await action(booking.id, "no-show");
    expect(res.body.status).toBe("NO_SHOW");
  });

  it("una reserva que ya terminó también se puede cerrar", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesAgo(180));
    expect((await action(booking.id, "complete")).status).toBe(200);
  });

  it("una reserva que aún no empieza no se puede cerrar (409)", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesFromNow(60));
    const res = await action(booking.id, "complete");
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/aún no empieza/);
  });

  it("solo se cierran las confirmadas (409): no las pendientes, canceladas ni ya cerradas", async () => {
    for (const status of ["PENDING", "CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
      const booking = await bookingFor(owner, courtId, status, minutesAgo(180));
      const res = await action(booking.id, "complete");
      expect(res.status, status).toBe(409);
    }
  });

  it("dos cierres simultáneos: solo uno pasa", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesAgo(30));
    const results = await Promise.all([action(booking.id, "complete"), action(booking.id, "no-show")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("el empleado puede cerrar, y otro establecimiento no puede (404)", async () => {
    const booking = await bookingFor(owner, courtId, "CONFIRMED", minutesAgo(30));
    const other = await bookableTenant();
    expect((await action(booking.id, "complete", other.owner.token)).status).toBe(404);

    const staff = await addStaff(owner.establishmentId);
    expect((await action(booking.id, "complete", staff)).status).toBe(200);
  });
});

describe("agenda: reservas vencidas", () => {
  it("una reserva 'por confirmar' que venció se cancela sola y deja de mostrarse", async () => {
    const { owner, court } = await bookableTenant();
    const date = dayFromNow(2);
    const booked = await reserveOnline(owner, court.id, date, "19:00");
    await prisma.booking.update({ where: { id: booked.id }, data: { expiresAt: minutesAgo(5) } });

    expect((await http.get(owner.token, `/bookings?date=${date}`)).body).toEqual([]);
    const all = await http.get(owner.token, `/bookings?date=${date}&includeCancelled=true`);
    expect(all.body[0]).toMatchObject({ status: "CANCELLED", cancelReason: "Venció sin confirmar" });
  });
});