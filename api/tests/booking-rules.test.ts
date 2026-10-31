import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/prisma";
import type { BookingStatus } from "../src/generated/prisma/client";

// Bogotá es UTC-5 todo el año (Colombia no tiene horario de verano).
const at = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 15, hour + 5, minute));

async function seed() {
  const establishment = await prisma.establishment.create({
    data: { slug: `t-${randomUUID().slice(0, 8)}`, name: "Complejo de prueba" },
  });
  const [court1, court2] = await Promise.all(
    ["Cancha 1", "Cancha 2"].map((name) =>
      prisma.court.create({ data: { establishmentId: establishment.id, name, sport: "FOOTBALL" } }),
    ),
  );
  const customer = await prisma.customer.create({
    data: { establishmentId: establishment.id, name: "Cliente de prueba", phone: "3001112233" },
  });

  const book = (court: { id: string }, startsAt: Date, endsAt: Date, status: BookingStatus = "PENDING") =>
    prisma.booking.create({
      data: {
        establishmentId: establishment.id,
        courtId: court.id,
        customerId: customer.id,
        startsAt,
        endsAt,
        status,
        price: 90_000,
      },
    });

  return { establishment, court1, court2, customer, book };
}

describe("regla anti-choque de reservas", () => {
  let ctx: Awaited<ReturnType<typeof seed>>;

  beforeEach(async () => {
    ctx = await seed();
  });

  it("permite reservar un horario libre", async () => {
    const booking = await ctx.book(ctx.court1, at(19), at(20));
    expect(booking.status).toBe("PENDING");
  });

  it("rechaza el mismo horario en la misma cancha", async () => {
    await ctx.book(ctx.court1, at(19), at(20));
    await expect(ctx.book(ctx.court1, at(19), at(20))).rejects.toThrow();
  });

  it("rechaza un cruce parcial y una reserva que contiene a otra", async () => {
    await ctx.book(ctx.court1, at(19), at(20));
    await expect(ctx.book(ctx.court1, at(19, 30), at(20, 30))).rejects.toThrow();
    await expect(ctx.book(ctx.court1, at(18), at(21))).rejects.toThrow();
  });

  it("permite reservas consecutivas: 7 a 8 y 8 a 9 no se cruzan", async () => {
    await ctx.book(ctx.court1, at(19), at(20));
    await ctx.book(ctx.court1, at(20), at(21));
    await ctx.book(ctx.court1, at(18), at(19));
  });

  it("permite el mismo horario en otra cancha", async () => {
    await ctx.book(ctx.court1, at(19), at(20));
    await ctx.book(ctx.court2, at(19), at(20));
  });

  it("una reserva cancelada libera el horario", async () => {
    const first = await ctx.book(ctx.court1, at(19), at(20), "CONFIRMED");
    await expect(ctx.book(ctx.court1, at(19), at(20))).rejects.toThrow();

    await prisma.booking.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    await ctx.book(ctx.court1, at(19), at(20));
  });

  it("no deja reactivar una reserva cancelada si el horario ya fue ocupado", async () => {
    const first = await ctx.book(ctx.court1, at(19), at(20), "CONFIRMED");
    await prisma.booking.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    await ctx.book(ctx.court1, at(19), at(20));

    await expect(
      prisma.booking.update({ where: { id: first.id }, data: { status: "CONFIRMED" } }),
    ).rejects.toThrow();
  });

  it("10 peticiones simultáneas por el mismo horario: solo una pasa", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => ctx.book(ctx.court1, at(19), at(20))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
    expect(await prisma.booking.count({ where: { courtId: ctx.court1.id } })).toBe(1);
  });

  it("rechaza una reserva que termina antes de empezar", async () => {
    await expect(ctx.book(ctx.court1, at(20), at(19))).rejects.toThrow();
  });
});

describe("aislamiento entre establecimientos", () => {
  it("una reserva no puede mezclar la cancha de un establecimiento con el cliente de otro", async () => {
    const mine = await seed();
    const other = await seed();

    await expect(
      prisma.booking.create({
        data: {
          establishmentId: other.establishment.id,
          courtId: mine.court1.id, // cancha de otro establecimiento
          customerId: other.customer.id,
          startsAt: at(10),
          endsAt: at(11),
          price: 90_000,
        },
      }),
    ).rejects.toThrow();
  });

  it("dos establecimientos pueden tener su propia 'Cancha 1' y reservar a la misma hora", async () => {
    const a = await seed();
    const b = await seed();
    await a.book(a.court1, at(19), at(20));
    await b.book(b.court1, at(19), at(20));
  });
});
