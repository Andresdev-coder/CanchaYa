import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import type { Role } from "../generated/prisma/client";
import { AppError } from "./errorHandler";

type TokenPayload = { sub: string; establishmentId: string; role: Role; iat?: number };

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Token requerido");

  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new AppError(401, "Token inválido o expirado");
  }

  // El token solo prueba quién eres; el estado real se consulta en la base.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { establishmentId: true, role: true, active: true, passwordChangedAt: true },
  });
  if (!user || !user.active) throw new AppError(401, "Tu sesión ya no es válida");

  // Un token emitido antes del último cambio de contraseña ya no sirve.
  if (
    user.passwordChangedAt &&
    payload.iat !== undefined &&
    payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    throw new AppError(401, "Tu contraseña cambió: inicia sesión de nuevo");
  }

  req.user = { id: payload.sub, establishmentId: user.establishmentId, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, "No tienes permiso para esta acción");
    }
    next();
  };
}