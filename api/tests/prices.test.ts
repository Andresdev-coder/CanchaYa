import { beforeEach, describe, expect, it } from "vitest";
import { addStaff, createCourt, http, ok, registerTenant, type Tenant } from "./helpers";

const day = { weekdays: [1, 2, 3, 4, 5], start: "06:00", end: "17:00", pricePerHour: 70_000 };
const night = { weekdays: [1, 2, 3, 4, 5], start: "17:00", end: "22:00", pricePerHour: 90_000 };

describe("tarifas por franja", () => {
  let owner: Tenant;
  let courtId: string;

  beforeEach(async () => {
    owner = await registerTenant();
    courtId = (await createCourt(owner.token)).id;
  });

  const put = (rules: object[], token = owner.token, id = courtId) =>
    http.put(token, `/courts/${id}/prices`, { rules });

  it("empieza sin franjas", async () => {
    const res = await http.get(owner.token, `/courts/${courtId}/prices`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("guarda las franjas y las devuelve ordenadas por hora de inicio", async () => {
    const res = await put([night, day]);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { start: string }) => r.start)).toEqual(["06:00", "17:00"]);
    expect(res.body[0]).toMatchObject({ weekdays: [1, 2, 3, 4, 5], end: "17:00", pricePerHour: 70_000 });
  });

  it("reemplaza las franjas anteriores", async () => {
    ok(await put([day, night]), 200);
    const res = await put([{ weekdays: [6], start: "08:00", end: "20:00", pricePerHour: 100_000 }]);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].weekdays).toEqual([6]);
  });

  it("permite franjas pegadas, y el mismo horario en días distintos", async () => {
    expect((await put([day, night])).status).toBe(200); // 17:00 termina una y empieza la otra
    const res = await put([day, { ...day, weekdays: [6, 0], pricePerHour: 100_000 }]);
    expect(res.status).toBe(200);
  });

  it("rechaza franjas que se cruzan el mismo día (400)", async () => {
    const res = await put([{ ...day, end: "18:00" }, night]);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("rules");
  });

  it.each([
    ["inicio igual al fin", { ...day, start: "10:00", end: "10:00" }],
    ["inicio después del fin", { ...day, start: "12:00", end: "10:00" }],
    ["sin días", { ...day, weekdays: [] }],
    ["un día inexistente", { ...day, weekdays: [7] }],
    ["un precio de 0", { ...day, pricePerHour: 0 }],
    ["un precio con decimales", { ...day, pricePerHour: 70_000.5 }],
  ])("rechaza una franja con %s (400)", async (_caso, rule) => {
    expect((await put([rule])).status).toBe(400);
  });

  it("ignora los días repetidos dentro de una franja", async () => {
    const res = await put([{ ...day, weekdays: [3, 1, 1, 2] }]);
    expect(res.body[0].weekdays).toEqual([1, 2, 3]);
  });

  it("enviar una lista vacía borra todas las franjas", async () => {
    ok(await put([day, night]), 200);
    const res = await put([]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("el empleado puede verlas pero no cambiarlas (403)", async () => {
    ok(await put([day]), 200);
    const staff = await addStaff(owner.establishmentId);
    expect((await http.get(staff, `/courts/${courtId}/prices`)).status).toBe(200);
    expect((await put([night], staff)).status).toBe(403);
  });

  it("las franjas de una cancha de otro establecimiento no se ven ni se cambian (404)", async () => {
    const other = await registerTenant();
    expect((await http.get(other.token, `/courts/${courtId}/prices`)).status).toBe(404);
    expect((await put([day], other.token)).status).toBe(404);
  });
});