import { describe, expect, it } from "vitest";
import { addStaff, http, ok, registerTenant } from "./helpers";

const week = [
  ...[1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: "06:00", closes: "22:00" })),
  { weekday: 0, opens: "08:00", closes: "20:00" },
];

describe("horario de atención", () => {
  it("empieza vacío", async () => {
    const owner = await registerTenant();
    const res = await http.get(owner.token, "/establishment/hours");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("el dueño define el horario y se devuelve ordenado por día", async () => {
    const owner = await registerTenant();
    ok(await http.put(owner.token, "/establishment/hours", { days: week }), 200);

    const res = await http.get(owner.token, "/establishment/hours");
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toEqual({ weekday: 0, opens: "08:00", closes: "20:00" });
    expect(res.body[1]).toEqual({ weekday: 1, opens: "06:00", closes: "22:00" });
  });

  it("reemplaza el horario anterior, y un día que no se envía queda cerrado", async () => {
    const owner = await registerTenant();
    ok(await http.put(owner.token, "/establishment/hours", { days: week }), 200);
    const res = await http.put(owner.token, "/establishment/hours", {
      days: [{ weekday: 6, opens: "09:00", closes: "18:00" }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ weekday: 6, opens: "09:00", closes: "18:00" }]);
  });

  it("acepta cerrar a medianoche (24:00)", async () => {
    const owner = await registerTenant();
    const res = await http.put(owner.token, "/establishment/hours", {
      days: [{ weekday: 5, opens: "18:00", closes: "24:00" }],
    });
    expect(res.status).toBe(200);
    expect(res.body[0].closes).toBe("24:00");
  });

  it.each([
    ["apertura después del cierre", { days: [{ weekday: 1, opens: "22:00", closes: "06:00" }] }],
    ["apertura igual al cierre", { days: [{ weekday: 1, opens: "24:00", closes: "24:00" }] }],
    ["un día repetido", { days: [{ weekday: 1, opens: "06:00", closes: "12:00" }, { weekday: 1, opens: "14:00", closes: "20:00" }] }],
    ["una hora con formato inválido", { days: [{ weekday: 1, opens: "6:00", closes: "22:00" }] }],
    ["un día de la semana inexistente", { days: [{ weekday: 7, opens: "06:00", closes: "22:00" }] }],
  ])("rechaza %s (400)", async (_caso, body) => {
    const owner = await registerTenant();
    expect((await http.put(owner.token, "/establishment/hours", body)).status).toBe(400);
  });

  it("el empleado puede ver el horario pero no cambiarlo (403)", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner.establishmentId);
    expect((await http.get(staff, "/establishment/hours")).status).toBe(200);
    expect((await http.put(staff, "/establishment/hours", { days: week })).status).toBe(403);
  });

  it("cada establecimiento ve solo su horario", async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    ok(await http.put(a.token, "/establishment/hours", { days: week }), 200);
    expect((await http.get(b.token, "/establishment/hours")).body).toEqual([]);
  });
});