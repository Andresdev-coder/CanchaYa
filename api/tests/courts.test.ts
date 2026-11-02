import { beforeEach, describe, expect, it } from "vitest";
import { addStaff, bookingFor, createCourt, http, ok, registerTenant, type Tenant } from "./helpers";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("canchas", () => {
  let owner: Tenant;

  beforeEach(async () => {
    owner = await registerTenant();
  });

  it("crea una cancha con valores por defecto", async () => {
    const res = await http.post(owner.token, "/courts", {
      name: "Cancha 1",
      sport: "FOOTBALL",
      surface: "Sintética",
      depositAmount: 30_000,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Cancha 1",
      sport: "FOOTBALL",
      surface: "Sintética",
      slotMinutes: 60,
      active: true,
      allowDeposit: true,
      depositAmount: 30_000,
      allowFullPayment: true,
    });
  });

  it("si permite abono, exige su valor (400)", async () => {
    const res = await http.post(owner.token, "/courts", { name: "Cancha 1", sport: "FOOTBALL" });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("depositAmount");
  });

  it("si no permite abono, guarda el valor vacío aunque llegue uno", async () => {
    const res = await http.post(owner.token, "/courts", {
      name: "Cancha 1",
      sport: "TENNIS",
      allowDeposit: false,
      depositAmount: 30_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.depositAmount).toBeNull();
  });

  it.each([
    ["un nombre vacío", { name: "" }, "name"],
    ["un deporte inexistente", { sport: "BASKET" }, "sport"],
    ["un turno de 45 minutos", { slotMinutes: 45 }, "slotMinutes"],
    ["un abono de 0", { depositAmount: 0 }, "depositAmount"],
  ])("rechaza %s (400) señalando el campo", async (_caso, change, field) => {
    const res = await http.post(owner.token, "/courts", {
      name: "Cancha 1",
      sport: "FOOTBALL",
      depositAmount: 30_000,
      ...change,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("rechaza un nombre repetido en el mismo establecimiento (409), pero no en otro", async () => {
    await createCourt(owner.token, { name: "Cancha 1" });
    const again = await http.post(owner.token, "/courts", { name: "Cancha 1", sport: "FOOTBALL", depositAmount: 30_000 });
    expect(again.status).toBe(409);

    const other = await registerTenant();
    const ok2 = await http.post(other.token, "/courts", { name: "Cancha 1", sport: "FOOTBALL", depositAmount: 30_000 });
    expect(ok2.status).toBe(201);
  });

  it("lista las activas por defecto, ordenadas por posición y nombre, y las inactivas si se piden", async () => {
    await createCourt(owner.token, { name: "B", sortOrder: 1 });
    const a = await createCourt(owner.token, { name: "A", sortOrder: 1 });
    await createCourt(owner.token, { name: "C", sortOrder: 0 });
    ok(await http.patch(owner.token, `/courts/${a.id}`, { active: false }), 200);

    const names = (res: { body: { name: string }[] }) => res.body.map((c) => c.name);
    expect(names(await http.get(owner.token, "/courts"))).toEqual(["C", "B"]);
    expect(names(await http.get(owner.token, "/courts?includeInactive=true"))).toEqual(["C", "A", "B"]);
  });

  it("editar un campo no reinicia los demás", async () => {
    const court = await createCourt(owner.token, { allowFullPayment: false, slotMinutes: 90, sortOrder: 5 });
    const res = await http.patch(owner.token, `/courts/${court.id}`, { name: "Nombre nuevo" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Nombre nuevo",
      allowFullPayment: false,
      slotMinutes: 90,
      sortOrder: 5,
      depositAmount: 30_000,
    });
  });

  it("activar el abono exige su valor, y desactivarlo lo borra", async () => {
    const court = await createCourt(owner.token, { allowDeposit: false });
    expect((await http.patch(owner.token, `/courts/${court.id}`, { allowDeposit: true })).status).toBe(400);

    const on = await http.patch(owner.token, `/courts/${court.id}`, { allowDeposit: true, depositAmount: 20_000 });
    expect(on.body).toMatchObject({ allowDeposit: true, depositAmount: 20_000 });

    const off = await http.patch(owner.token, `/courts/${court.id}`, { allowDeposit: false });
    expect(off.body).toMatchObject({ allowDeposit: false, depositAmount: null });
  });

  it("rechaza una edición vacía y un id inválido (400)", async () => {
    const court = await createCourt(owner.token);
    expect((await http.patch(owner.token, `/courts/${court.id}`, {})).status).toBe(400);
    expect((await http.get(owner.token, "/courts/no-es-uuid")).status).toBe(400);
  });

  it("el empleado puede ver las canchas pero no crearlas ni editarlas (403)", async () => {
    const court = await createCourt(owner.token);
    const staff = await addStaff(owner.establishmentId);
    expect((await http.get(staff, "/courts")).status).toBe(200);
    expect((await http.get(staff, `/courts/${court.id}`)).status).toBe(200);
    expect((await http.post(staff, "/courts", { name: "X", sport: "FOOTBALL", depositAmount: 1000 })).status).toBe(403);
    expect((await http.patch(staff, `/courts/${court.id}`, { name: "Hackeada" })).status).toBe(403);
  });

  it("una cancha de otro establecimiento no se ve ni se toca (404)", async () => {
    const court = await createCourt(owner.token);
    const other = await registerTenant();
    expect((await http.get(other.token, `/courts/${court.id}`)).status).toBe(404);
    expect((await http.patch(other.token, `/courts/${court.id}`, { name: "Robada" })).status).toBe(404);
    expect((await http.get(other.token, "/courts")).body).toEqual([]);
  });

  describe("desactivar", () => {
    it("no se puede si tiene reservas pendientes o confirmadas a futuro (409)", async () => {
      const court = await createCourt(owner.token);
      await bookingFor(owner, court.id, "CONFIRMED", inDays(2));

      const res = await http.patch(owner.token, `/courts/${court.id}`, { active: false });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/reserva/i);
    });

    it("se puede cuando las reservas futuras fueron canceladas", async () => {
      const court = await createCourt(owner.token);
      await bookingFor(owner, court.id, "CANCELLED", inDays(2));
      expect((await http.patch(owner.token, `/courts/${court.id}`, { active: false })).status).toBe(200);
    });

    it("se puede cuando las reservas ya pasaron", async () => {
      const court = await createCourt(owner.token);
      await bookingFor(owner, court.id, "COMPLETED", inDays(-3));
      expect((await http.patch(owner.token, `/courts/${court.id}`, { active: false })).status).toBe(200);
    });

    it("se puede volver a activar", async () => {
      const court = await createCourt(owner.token);
      ok(await http.patch(owner.token, `/courts/${court.id}`, { active: false }), 200);
      const res = await http.patch(owner.token, `/courts/${court.id}`, { active: true });
      expect(res.body.active).toBe(true);
    });
  });
});