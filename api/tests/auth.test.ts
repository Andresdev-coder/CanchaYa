import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { http, ok, PASSWORD, prisma, registerTenant } from "./helpers";

const newOwner = () => ({
  establishmentName: `Complejo ${randomUUID().slice(0, 8)}`,
  name: "Pepe",
  email: `pepe-${randomUUID()}@test.com`,
  password: PASSWORD,
});

describe("auth", () => {
  it("registra un establecimiento con su dueño, su dirección web y un token", async () => {
    const res = await request(app).post("/auth/register").send(newOwner());
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.role).toBe("OWNER");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.establishment.slug).toMatch(/^complejo-[a-f0-9]{8}$/);
    expect(res.body.establishment.timezone).toBe("America/Bogota");
  });

  it("si la dirección web ya existe, genera otra con un sufijo", async () => {
    const name = `Complejo ${randomUUID().slice(0, 8)}`;
    const first = await registerTenant(name);
    const second = await registerTenant(name);
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug.startsWith(`${first.slug}-`)).toBe(true);
  });

  it("no entrega direcciones reservadas como 'admin'", async () => {
    const tenant = await registerTenant("Admin");
    expect(tenant.slug).not.toBe("admin");
    expect(tenant.slug.startsWith("admin-")).toBe(true);
  });

    it("no entrega la dirección reservada 'bookings'", async () => {
    const tenant = await registerTenant("Bookings");
    expect(tenant.slug.startsWith("bookings-")).toBe(true);
  });
  
  it("rechaza un correo repetido (409)", async () => {
    const owner = newOwner();
    await request(app).post("/auth/register").send(owner);
    const res = await request(app)
      .post("/auth/register")
      .send({ ...owner, establishmentName: `Otro ${randomUUID().slice(0, 8)}` });
    expect(res.status).toBe(409);
  });

  it.each([
    ["una contraseña corta", { password: "123" }, "password"],
    ["un correo inválido", { email: "no-es-correo" }, "email"],
    ["un nombre de establecimiento de una letra", { establishmentName: "A" }, "establishmentName"],
    ["un teléfono inválido", { phone: "abc" }, "phone"],
  ])("rechaza %s (400) señalando el campo", async (_caso, change, field) => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...newOwner(), ...change });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("inicia sesión con credenciales correctas", async () => {
    const tenant = await registerTenant();
    const res = await request(app).post("/auth/login").send({ email: tenant.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("da el mismo 401 con contraseña incorrecta y con correo inexistente", async () => {
    const tenant = await registerTenant();
    const wrongPassword = await request(app).post("/auth/login").send({ email: tenant.email, password: "otra-clave" });
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: `nadie-${randomUUID()}@test.com`, password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it("/auth/me devuelve el usuario y su establecimiento", async () => {
    const tenant = await registerTenant();
    const res = await http.get(tenant.token, "/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: tenant.userId, role: "OWNER" });
    expect(res.body.establishment).toMatchObject({ id: tenant.establishmentId, slug: tenant.slug });
  });

  it("exige un token válido (401)", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401);
    expect((await http.get("token-falso", "/auth/me")).status).toBe(401);
  });

  it("un usuario desactivado pierde el acceso de inmediato (401)", async () => {
    const tenant = await registerTenant();
    expect((await http.get(tenant.token, "/auth/me")).status).toBe(200);

    await prisma.user.update({ where: { id: tenant.userId }, data: { active: false } });

    expect((await http.get(tenant.token, "/auth/me")).status).toBe(401);
    const login = await request(app).post("/auth/login").send({ email: tenant.email, password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it("un JSON mal formado responde 400, no 500", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{esto no es json");
    expect(res.status).toBe(400);
  });
});