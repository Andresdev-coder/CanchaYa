import { describe, expect, it } from "vitest";
import { addStaff, http, ok, registerTenant } from "./helpers";

describe("establecimiento", () => {
  it("el dueño ve su establecimiento", async () => {
    const tenant = await registerTenant();
    const res = await http.get(tenant.token, "/establishment");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: tenant.establishmentId, slug: tenant.slug, city: "Yopal" });
  });

  it("el dueño actualiza nombre, teléfono e instrucciones de pago", async () => {
    const tenant = await registerTenant();
    const res = await http.patch(tenant.token, "/establishment", {
      name: "Complejo Los Llanos",
      phone: "3101234567",
      paymentInstructions: "Nequi 310 123 4567, a nombre de Diana R.",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Complejo Los Llanos",
      phone: "3101234567",
      paymentInstructions: "Nequi 310 123 4567, a nombre de Diana R.",
    });
  });

  it("se puede borrar el teléfono con null", async () => {
    const tenant = await registerTenant();
    ok(await http.patch(tenant.token, "/establishment", { phone: "3101234567" }), 200);
    const res = await http.patch(tenant.token, "/establishment", { phone: null });
    expect(res.body.phone).toBeNull();
  });

  it("la dirección web no se puede cambiar: se ignora", async () => {
    const tenant = await registerTenant();
    const res = await http.patch(tenant.token, "/establishment", { name: "Nuevo nombre", slug: "otra-direccion" });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(tenant.slug);
  });

  it("rechaza un teléfono inválido y una edición vacía (400)", async () => {
    const tenant = await registerTenant();
    expect((await http.patch(tenant.token, "/establishment", { phone: "abc" })).status).toBe(400);
    expect((await http.patch(tenant.token, "/establishment", {})).status).toBe(400);
    expect((await http.patch(tenant.token, "/establishment", { slug: "solo-direccion" })).status).toBe(400);
  });

  it("el empleado puede verlo pero no editarlo (403)", async () => {
    const tenant = await registerTenant();
    const staff = await addStaff(tenant.establishmentId);
    expect((await http.get(staff, "/establishment")).status).toBe(200);
    expect((await http.patch(staff, "/establishment", { name: "Hackeado" })).status).toBe(403);
  });

  it("cada usuario ve solo su propio establecimiento", async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    expect((await http.get(a.token, "/establishment")).body.id).toBe(a.establishmentId);
    expect((await http.get(b.token, "/establishment")).body.id).toBe(b.establishmentId);
  });
});