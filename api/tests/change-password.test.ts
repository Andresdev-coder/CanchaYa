import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { http, ok, PASSWORD, prisma, registerTenant } from "./helpers";

const NEW_PASSWORD = "nueva-clave-segura-7";
const change = (token: string, body: object) => http.post(token, "/auth/change-password", body);
const loginAs = (email: string, password: string) => request(app).post("/auth/login").send({ email, password });

/** Una sesión emitida hace un minuto. */
const oldSession = (userId: string, establishmentId: string, role = "OWNER") =>
  jwt.sign({ establishmentId, role, iat: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "7d",
  });

describe("cambiar mi contraseña", () => {
  it("cambia la contraseña y entrega una sesión nueva que sigue funcionando", async () => {
    const owner = await registerTenant();
    const res = await change(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    expect((await http.get(res.body.token, "/auth/me")).status).toBe(200);
    expect((await loginAs(owner.email, NEW_PASSWORD)).status).toBe(200);
    expect((await loginAs(owner.email, PASSWORD)).status).toBe(401);
  });

  it("las sesiones anteriores dejan de servir", async () => {
    const owner = await registerTenant();
    const before = oldSession(owner.userId, owner.establishmentId);
    expect((await http.get(before, "/auth/me")).status).toBe(200);

    const res = await change(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect((await http.get(before, "/auth/me")).status).toBe(401);
    expect((await http.get(res.body.token, "/auth/me")).status).toBe(200);
  });

  it("con la contraseña actual equivocada responde 400 (no 401: no cierra la sesión) y no cambia nada", async () => {
    const owner = await registerTenant();
    const res = await change(owner.token, { currentPassword: "no-es-esa", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contraseña actual/);
    expect((await loginAs(owner.email, PASSWORD)).status).toBe(200);
  });

  it("rechaza una contraseña nueva corta o igual a la actual (400)", async () => {
    const owner = await registerTenant();
    const short = await change(owner.token, { currentPassword: PASSWORD, newPassword: "123" });
    expect(short.status).toBe(400);
    expect(short.body.errors.map((e: { field: string }) => e.field)).toContain("newPassword");
    expect((await change(owner.token, { currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
  });

  it("pide sesión (401)", async () => {
    const res = await request(app).post("/auth/change-password").send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("un empleado también puede cambiar la suya, y no afecta a las demás personas", async () => {
    const owner = await registerTenant();
    const email = `staff-${randomUUID()}@test.com`;
    const created = ok(await http.post(owner.token, "/users", { name: "Mateo Giraldo", email, password: "clave-segura-1" })) as { id: string };
    const staffToken = ok(await loginAs(email, "clave-segura-1"), 200).token as string;

    ok(await change(staffToken, { currentPassword: "clave-segura-1", newPassword: NEW_PASSWORD }), 200);

    expect((await loginAs(email, NEW_PASSWORD)).status).toBe(200);
    expect((await http.get(owner.token, "/auth/me")).status).toBe(200); // la sesión del dueño sigue igual
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).passwordChangedAt).not.toBeNull();
  });
});
