import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Datos inválidos",
      errors: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message });
  }

  // Errores del lector de JSON de Express: son culpa de quien llama, no del servidor.
  const type = typeof err === "object" && err !== null && "type" in err ? err.type : undefined;
  if (type === "entity.parse.failed") {
    return res.status(400).json({ message: "El cuerpo de la petición no es un JSON válido" });
  }
  if (type === "entity.too.large") {
    return res.status(413).json({ message: "La petición es demasiado grande" });
  }

  console.error(err);
  return res.status(500).json({ message: "Error interno del servidor" });
}