import { beforeEach, describe, expect, it } from "vitest";
import { addStaff, bookableTenant, bookOnline, dayFromNow, http, ok, slotAt, type Tenant } from "./helpers";

describe("reserva por teléfono", () => {
  let owner: Tenant;
  let courtId: string;
  const date = dayFromNow(2);

  beforeEach(async () => {
    const t = await bookableTenant();
    owner = t.owner;
    courtId = t.court.id;
  });

  const manual = (body: object, token = owner.token) =>
    http.post(token, "/bookings", { courtId, name: "Cliente por teléfono", phone: "3105550100", ...body });

  it("nace confirmada, sin vencimiento, con el precio del servidor, y ocupa el turno", async () => {
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    const res = await manual({ start: slot.start, price: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "CONFIRMED",
      source: "MANUAL",
      paymentChoice: "AT_COURT",
      price: 90_000,
      expiresAt: null,
      paymentStatus: "UNPAID",
      customer: { name: "Cliente por teléfono", phone: "3105550100" },
    });
    expect((await slotAt(owner.slug, courtId, date, "19:00")).available).toBe(false);
  });

  it("aparece en la agenda", async () => {
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    ok(await manual({ start: slot.start }));
    const res = await http.get(owner.token, `/bookings?date=${date}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe("MANUAL");
  });

  it("no se puede reservar un turno ocupado, ni por teléfono ni en línea (409)", async () => {
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    ok(await manual({ start: slot.start }));
    expect((await manual({ start: slot.start, phone: "3105550101" })).status).toBe(409);
    expect((await bookOnline(owner.slug, { courtId, start: slot.start })).status).toBe(409);
  });

  it("una reserva en línea y una por teléfono simultáneas: solo una pasa", async () => {
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    const results = await Promise.all([
      manual({ start: slot.start }),
      bookOnline(owner.slug, { courtId, start: slot.start }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("no tiene el límite de 3 reservas por teléfono", async () => {
    for (const time of ["17:00", "18:00", "19:00", "20:00"]) {
      const slot = await slotAt(owner.slug, courtId, date, time);
      expect((await manual({ start: slot.start })).status).toBe(201);
    }
  });

  it.each([
    ["un horario que no es el inicio de un turno", () => new Date(Date.now() + 2 * 86_400_000).toISOString()],
    ["un turno que ya pasó", () => new Date(Date.now() - 86_400_000).toISOString()],
  ])("rechaza %s (400)", async (_caso, start) => {
    expect((await manual({ start: start() })).status).toBe(400);
  });

  it("rechaza un teléfono que no es celular (400)", async () => {
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    const res = await manual({ start: slot.start, phone: "123" });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("phone");
  });

  it("el empleado también puede crearla, y una cancha de otro establecimiento da 404", async () => {
    const staff = await addStaff(owner.establishmentId);
    const slot = await slotAt(owner.slug, courtId, date, "19:00");
    expect((await manual({ start: slot.start }, staff)).status).toBe(201);

    const other = await bookableTenant();
    const otherSlot = await slotAt(other.owner.slug, other.court.id, date, "19:00");
    const res = await http.post(owner.token, "/bookings", {
      courtId: other.court.id,
      start: otherSlot.start,
      name: "Intruso",
      phone: "3105550102",
    });
    expect(res.status).toBe(404);
  });
});