import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { http, PASSWORD, registerTenant } from "./helpers";

// Las pruebas normales corren sin límites. Aquí se arma una aplicación aparte, con los límites encendidos,
// para comprobar que cada ruta real tiene puesto el suyo.
const limited = (ipLimits = false) => createApp({ rateLimit: { disabled: false, ipLimits } });

describe("límites en la aplicación real", () => {
  it("el sexto ingreso fallido de una cuenta recibe 429, aunque la contraseña sea la correcta", async () => {
    const owner = await registerTenant();
    const app = limited();
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/auth/login").send({ email: owner.email, password: "mala-clave" })).status).toBe(401);
    }
    const blocked = await request(app).post("/auth/login").send({ email: owner.email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Demasiados intentos/);
  });

  it("el bloqueo es solo de esa cuenta", async () => {
    const victim = await registerTenant();
    const other = await registerTenant();
    const app = limited();
    for (let i = 0; i < 6; i++) await request(app).post("/auth/login").send({ email: victim.email, password: "mala-clave" });
    expect((await request(app).post("/auth/login").send({ email: other.email, password: PASSWORD })).status).toBe(200);
  });

  it("cambiar la contraseña tiene su propio límite por usuario", async () => {
    const owner = await registerTenant();
    const app = limited();
    const change = () =>
      request(app).post("/auth/change-password").set("Authorization", `Bearer ${owner.token}`).send({ currentPassword: "no-es-esa", newPassword: "otra-clave-larga-1" });
    for (let i = 0; i < 5; i++) expect((await change()).status).toBe(400);
    expect((await change()).status).toBe(429);
  });

  it("sin el proxy medido no hay límites por IP: la lectura pública no se corta", async () => {
    const app = limited(false);
    for (let i = 0; i < 130; i++) expect((await request(app).get("/public/no-existe-este-lugar")).status).toBe(404);
  });

  it("con los límites por IP activados, la lectura pública se corta a las 120 por minuto", async () => {
    const app = limited(true);
    for (let i = 0; i < 120; i++) expect((await request(app).get("/public/no-existe-este-lugar")).status).toBe(404);
    expect((await request(app).get("/public/no-existe-este-lugar")).status).toBe(429);
  });

  it("el diagnóstico de IP no existe sin IP_DEBUG_TOKEN", async () => {
    const res = await request(limited()).get("/_debug/ip").set("x-debug-token", "cualquiera-cualquiera-1");
    expect(res.status).toBe(404);
  });

  it("la aplicación de las pruebas sigue sin límites", async () => {
    const owner = await registerTenant();
    for (let i = 0; i < 8; i++) await http.get(owner.token, "/auth/me");
    expect((await http.get(owner.token, "/auth/me")).status).toBe(200);
  });
});
