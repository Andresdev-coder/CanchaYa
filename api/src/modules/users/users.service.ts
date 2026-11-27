import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { TEAM } from "../../config/team";
import type { User } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { createUserSchema, updateUserSchema } from "./users.schemas";

const isUnique = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

function toDto(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  };
}

const activeCount = (establishmentId: string) => prisma.user.count({ where: { establishmentId, active: true } });

function assertRoom(active: number) {
  if (active >= TEAM.maxActive) {
    throw new AppError(409, `Tu equipo ya tiene ${TEAM.maxActive} personas activas. Desactiva a alguien para sumar a otra.`);
  }
}

/** El dueño primero y luego los empleados, del más antiguo al más reciente. */
export async function list(establishmentId: string) {
  const users = await prisma.user.findMany({
    where: { establishmentId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return users.map(toDto);
}

export async function create(establishmentId: string, input: z.infer<typeof createUserSchema>) {
  const [active, total] = await Promise.all([
    activeCount(establishmentId),
    prisma.user.count({ where: { establishmentId } }),
  ]);
  assertRoom(active);
  if (total >= TEAM.maxTotal) throw new AppError(409, "Llegaste al máximo de personas registradas en tu equipo.");

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new AppError(409, "Ese correo ya está registrado");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const user = await prisma.user.create({
      data: { establishmentId, name: input.name, email: input.email, passwordHash, role: "STAFF" },
    });
    return toDto(user);
  } catch (err) {
    if (isUnique(err)) throw new AppError(409, "Ese correo ya está registrado");
    throw err;
  }
}

/**
 * Cambia el nombre, activa o desactiva, o restablece la contraseña de un empleado.
 * Desactivar surte efecto en la siguiente petición de esa persona, y restablecer la contraseña invalida sus sesiones abiertas.
 */
export async function update(establishmentId: string, id: string, input: z.infer<typeof updateUserSchema>) {
  const target = await prisma.user.findFirst({ where: { id, establishmentId } });
  if (!target) throw new AppError(404, "Persona no encontrada");
  if (target.role !== "STAFF") throw new AppError(409, "Los datos del dueño se cambian desde «Mi cuenta»");

  if (input.active === true && !target.active) assertRoom(await activeCount(establishmentId));

  const data: Partial<Pick<User, "name" | "active" | "passwordHash" | "passwordChangedAt">> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  if (input.password !== undefined) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
    data.passwordChangedAt = new Date();
  }
  return toDto(await prisma.user.update({ where: { id }, data }));
}
