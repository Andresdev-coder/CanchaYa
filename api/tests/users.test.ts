import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { TEAM } from "../src/config/team";
import { http, ok, PASSWORD, prisma, registerTenant, type Tenant } from "./helpers";

const staffBody = (over: object = {}) => ({
  name: "Mateo Giraldo",
  email: `staff-${randomUUID()}@test.com`,
  password: "clave-segura-1",
  ...over,
});

const addStaff = async (owner: Tenant, over: object = {}) => {
  const body = staffBody(over);
  const created = ok(await http.post(owner.token, "/users", body)) as { id: string; email: string };
  return { ...created, password: body.password };
};

const loginAs = (email: string, password: string) => request(app).post("/auth/login").send({ email, password });
const tokenOf = async (email: string, password: string) => ok(await loginAs(email, password), 200).token as string;

/** Una sesión emitida hace un minuto, para probar lo que pasa con las sesiones abiertas antes de un cambio. */
const oldSession = (userId: string, establishmentId: string) =>
  jwt.sign({ establishmentId, role: "STAFF", iat: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "7d",
  });

describe("equipo: listar y crear", () => {
  it("el dueño ve a su equipo, él primero, sin datos secretos", async () => {
    const owner = await registerTenant();
    await addStaff(owner, { name: "Primero" });
    await addStaff(owner, { name: "Segundo" });

    const res = await http.get(owner.token, "/users");
    expect(res.status).toBe(200);
    expect(res.body.map((u: { name: string }) => u.name)).toEqual(["Dueño", "Primero", "Segundo"]);
    expect(res.body[0]).toMatchObject({ role: "OWNER", active: true });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|recoveryCodeHash/);
  });

  it("crea un empleado que puede ingresar, con rol STAFF", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);

    const login = await loginAs(staff.email, staff.password);
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: "STAFF", establishmentId: owner.establishmentId });
    expect((await http.get(login.body.token, "/auth/me")).body.establishment.id).toBe(owner.establishmentId);
  });

  it("el correo se guarda en minúsculas y no se puede repetir, ni siquiera en otro establecimiento", async () => {
    const owner = await registerTenant();
    const other = await registerTenant();
    const email = `Mixto-${randomUUID()}@Test.com`;

    const first = await http.post(owner.token, "/users", staffBody({ email }));
    expect(first.status).toBe(201);
    expect(first.body.email).toBe(email.toLowerCase());

    expect((await http.post(owner.token, "/users", staffBody({ email }))).status).toBe(409);
    expect((await http.post(other.token, "/users", staffBody({ email }))).status).toBe(409);
  });

  it.each([
    ["una contraseña corta", { password: "123" }, "password"],
    ["un correo inválido", { email: "no-es-correo" }, "email"],
    ["un nombre de una letra", { name: "A" }, "name"],
  ])("rechaza %s (400)", async (_caso, change, field) => {
    const owner = await registerTenant();
    const res = await http.post(owner.token, "/users", staffBody(change));
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("el equipo tiene un máximo de personas activas, y desactivar a alguien libera un lugar", async () => {
    const owner = await registerTenant();
    const members: { id: string }[] = [];
    for (let i = 0; i < TEAM.maxActive - 1; i++) members.push(await addStaff(owner)); // el dueño ocupa el primer lugar

    const full = await http.post(owner.token, "/users", staffBody());
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/10 personas activas/);

    ok(await http.patch(owner.token, `/users/${members[0].id}`, { active: false }), 200);
    expect((await http.post(owner.token, "/users", staffBody())).status).toBe(201);
  });

  it("no se puede reactivar a alguien si el equipo ya está lleno (409)", async () => {
    const owner = await registerTenant();
    const first = await addStaff(owner);
    ok(await http.patch(owner.token, `/users/${first.id}`, { active: false }), 200);
    for (let i = 0; i < TEAM.maxActive - 1; i++) await addStaff(owner);

    expect((await http.patch(owner.token, `/users/${first.id}`, { active: true })).status).toBe(409);
  });
});

describe("equipo: quién puede administrarlo", () => {
  it("el empleado no puede ver, crear ni editar a nadie (403)", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    const token = await tokenOf(staff.email, staff.password);

    expect((await http.get(token, "/users")).status).toBe(403);
    expect((await http.post(token, "/users", staffBody())).status).toBe(403);
    expect((await http.patch(token, `/users/${staff.id}`, { name: "Otro nombre" })).status).toBe(403);
  });

  it("sin sesión se pide ingresar (401)", async () => {
    expect((await request(app).get("/users")).status).toBe(401);
  });

  it("otro establecimiento no ve ni toca a mis empleados (404)", async () => {
    const owner = await registerTenant();
    const other = await registerTenant();
    const staff = await addStaff(owner);

    expect((await http.get(other.token, "/users")).body).toHaveLength(1); // solo él mismo
    expect((await http.patch(other.token, `/users/${staff.id}`, { active: false })).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).active).toBe(true);
  });

  it("los datos del dueño no se cambian desde aquí (409)", async () => {
    const owner = await registerTenant();
    const res = await http.patch(owner.token, `/users/${owner.userId}`, { active: false });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).active).toBe(true);
  });
});

describe("equipo: editar", () => {
  it("cambia el nombre", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    const res = await http.patch(owner.token, `/users/${staff.id}`, { name: "Mateo G." });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Mateo G.");
  });

  it("desactivar surte efecto de inmediato: su sesión abierta deja de servir y ya no puede ingresar", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    const token = await tokenOf(staff.email, staff.password);
    expect((await http.get(token, "/auth/me")).status).toBe(200);

    expect((await http.patch(owner.token, `/users/${staff.id}`, { active: false })).body.active).toBe(false);

    expect((await http.get(token, "/auth/me")).status).toBe(401);
    expect((await loginAs(staff.email, staff.password)).status).toBe(401);
  });

  it("al reactivarlo, vuelve a ingresar", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    ok(await http.patch(owner.token, `/users/${staff.id}`, { active: false }), 200);
    ok(await http.patch(owner.token, `/users/${staff.id}`, { active: true }), 200);
    expect((await loginAs(staff.email, staff.password)).status).toBe(200);
  });

  it("restablecer la contraseña cierra sus sesiones abiertas, la anterior deja de servir y la nueva funciona", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    const open = oldSession(staff.id, owner.establishmentId);
    expect((await http.get(open, "/auth/me")).status).toBe(200);

    ok(await http.patch(owner.token, `/users/${staff.id}`, { password: "otra-clave-nueva-9" }), 200);

    expect((await http.get(open, "/auth/me")).status).toBe(401);
    expect((await loginAs(staff.email, staff.password)).status).toBe(401);
    expect((await loginAs(staff.email, "otra-clave-nueva-9")).status).toBe(200);
  });

  it("rechaza una edición vacía, una contraseña corta y un id inválido (400)", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    expect((await http.patch(owner.token, `/users/${staff.id}`, {})).status).toBe(400);
    expect((await http.patch(owner.token, `/users/${staff.id}`, { password: "123" })).status).toBe(400);
    expect((await http.patch(owner.token, "/users/no-es-uuid", { active: false })).status).toBe(400);
  });
});

describe("el equipo y lo que cada uno puede hacer", () => {
  it("un empleado atiende reservas pero no configura el establecimiento", async () => {
    const owner = await registerTenant();
    const staff = await addStaff(owner);
    const token = await tokenOf(staff.email, staff.password);

    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    expect((await http.get(token, `/bookings?date=${date}`)).status).toBe(200);
    expect((await http.patch(token, "/establishment", { name: "Hackeado" })).status).toBe(403);
    expect((await http.get(token, "/courts")).status).toBe(200);
  });
});
