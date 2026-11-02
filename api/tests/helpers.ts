import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";
import type { BookingStatus } from "../src/generated/prisma/client";

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

let courtSeq = 0;

export async function createCourt(token: string, overrides: object = {}) {
  const res = await http.post(token, "/courts", {
    name: `Cancha ${++courtSeq}-${randomUUID().slice(0, 4)}`,
    sport: "FOOTBALL",
    depositAmount: 30_000,
    ...overrides,
  });
  return ok(res) as { id: string; name: string; [key: string]: any };
}

/** Crea directo en la base un cliente y una reserva (aún no hay API de reservas). */
export async function bookingFor(tenant: Tenant, courtId: string, status: BookingStatus, startsAt: Date) {
  const customer = await prisma.customer.create({
    data: {
      establishmentId: tenant.establishmentId,
      name: "Cliente de prueba",
      phone: `3${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    },
  });
  return prisma.booking.create({
    data: {
      establishmentId: tenant.establishmentId,
      courtId,
      customerId: customer.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      status,
      price: 90_000,
    },
  });
}

export const allWeek = [0, 1, 2, 3, 4, 5, 6];

/** Establecimiento listo para reservar: abre todos los días de 06:00 a 22:00 y tiene una cancha con tarifa de día y de noche. */
export async function bookableTenant() {
  const owner = await registerTenant();
  ok(
    await http.put(owner.token, "/establishment/hours", {
      days: allWeek.map((weekday) => ({ weekday, opens: "06:00", closes: "22:00" })),
    }),
    200,
  );
  const court = await createCourt(owner.token, { depositAmount: 30_000 });
  ok(
    await http.put(owner.token, `/courts/${court.id}/prices`, {
      rules: [
        { weekdays: allWeek, start: "06:00", end: "17:00", pricePerHour: 70_000 },
        { weekdays: allWeek, start: "17:00", end: "22:00", pricePerHour: 90_000 },
      ],
    }),
    200,
  );
  return { owner, court };
}

/** La fecha de Bogotá dentro de N días, en formato AAAA-MM-DD. */
export const dayFromNow = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(Date.now() + days * 86_400_000));

/** Busca un turno por su hora en la disponibilidad pública. */
export async function slotAt(slug: string, courtId: string, date: string, time: string) {
  const res = await request(app).get(`/public/${slug}/availability`).query({ courtId, date });
  const slot = ok(res, 200).slots.find((s: { startTime: string }) => s.startTime === time);
  if (!slot) throw new Error(`No hay turno a las ${time} el ${date}`);
  return slot as { start: string; end: string; startTime: string; endTime: string; price: number; available: boolean };
}

let phoneSeq = 0;

/** Reserva como jugador (sin cuenta). Cada llamada usa un teléfono distinto, salvo que se indique otro. */
export const bookOnline = (slug: string, body: object) =>
  request(app)
    .post(`/public/${slug}/bookings`)
    .send({ name: "Jugador de prueba", phone: `310${String(1_000_000 + ++phoneSeq).slice(-7)}`, ...body });

/** Reserva como jugador un turno y devuelve la reserva creada. */
export async function reserveOnline(owner: Tenant, courtId: string, date: string, time: string, body: object = {}) {
  const slot = await slotAt(owner.slug, courtId, date, time);
  return ok(await bookOnline(owner.slug, { courtId, start: slot.start, ...body })) as {
    id: string;
    [key: string]: any;
  };
}