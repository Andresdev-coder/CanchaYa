import type { Role } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; establishmentId: string; role: Role };
    }
  }
}

export {};