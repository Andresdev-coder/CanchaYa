import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import type { User } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { RESERVED_SLUGS, slugify } from "../../utils/slug";
import { publicEstablishment } from "../establishments/establishments.service";
import { loginSchema, registerSchema } from "./auth.schemas";

function signToken(user: Pick<User, "id" | "establishmentId" | "role">) {
  return jwt.sign({ establishmentId: user.establishmentId, role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "7d",
  });
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    establishmentId: user.establishmentId,
  };
}

/** Busca una dirección web libre: primero la del nombre, y si no, con un sufijo corto. */
async function freeSlug(base: string) {
  const taken = async (slug: string) =>
    RESERVED_SLUGS.has(slug) ||
    (await prisma.establishment.findUnique({ where: { slug }, select: { id: true } })) !== null;

  if (!(await taken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomBytes(2).toString("hex")}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new AppError(409, "No pudimos generar una dirección para tu establecimiento. Prueba con otro nombre.");
}

export async function register(input: z.infer<typeof registerSchema>) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError(409, "Ese correo ya está registrado");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const slug = await freeSlug(slugify(input.establishmentName));

  try {
    const { establishment, user } = await prisma.$transaction(async (tx) => {
      const establishment = await tx.establishment.create({
        data: { name: input.establishmentName, slug, phone: input.phone },
      });
      const user = await tx.user.create({
        data: {
          establishmentId: establishment.id,
          name: input.name,
          email: input.email,
          passwordHash,
          role: "OWNER",
        },
      });
      return { establishment, user };
    });

    return {
      token: signToken(user),
      user: publicUser(user),
      establishment: publicEstablishment(establishment),
    };
  } catch (err) {
    // Dos registros simultáneos pudieron elegir el mismo correo o la misma dirección.
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") {
      throw new AppError(409, "Ese correo o esa dirección ya están en uso. Intenta de nuevo.");
    }
    throw err;
  }
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user && user.active && (await bcrypt.compare(input.password, user.passwordHash));
  if (!user || !valid) throw new AppError(401, "Correo o contraseña incorrectos");

  return { token: signToken(user), user: publicUser(user) };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { establishment: true } });
  if (!user) throw new AppError(404, "Usuario no encontrado");
  return { user: publicUser(user), establishment: publicEstablishment(user.establishment) };
}