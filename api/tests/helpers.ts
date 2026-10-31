import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";

export { prisma };

export const PASSWORD = "12345678";

export type Tenant = { token: string; establishmentId: string; userId: string; email: string; slug: string };

type Res = { status: number; body: any };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const http = {
  get: (token: string, path: string) => request(app).get(path).set(auth(token)),
  post: (token: string, path: string, body?: object) => request(app).post(path).set(auth(token)).send(body),
  put: (token: string, path: string, body?: object) => request(app).put(path).set(auth(token)).send(body),
  patch: (token: string, path: string, body?: object) => request(app).patch(path).set(auth(token)).send(body),
};

/** Exige un código de respuesta y devuelve el body; si no coincide, el error muestra qué llegó. */
export function ok(res: Res, expected = 201) {
  if (res.status !== expected) {
    throw new Error(`Esperaba ${expected} y llegó ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Establecimiento nuevo con su dueño. Cada prueba usa el suyo, así quedan aisladas. */
export async function registerTenant(name = `Complejo ${randomUUID().slice(0, 8)}`): Promise<Tenant> {
  const email = `owner-${randomUUID()}@test.com`;
  const body = ok(
    await request(app).post("/auth/register").send({ establishmentName: name, name: "Dueño", email, password: PASSWORD }),
  );
  return {
    token: body.token,
    establishmentId: body.establishment.id,
    userId: body.user.id,
    email,
    slug: body.establishment.slug,
  };
}

/** Aún no hay endpoint para crear empleados, así que se crea directo en la base. */
export async function addStaff(establishmentId: string) {
  const email = `staff-${randomUUID()}@test.com`;
  await prisma.user.create({
    data: {
      establishmentId,
      name: "Empleado",
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "STAFF",
    },
  });
  const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
  return ok(res, 200).token as string;
}