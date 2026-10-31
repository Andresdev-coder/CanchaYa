import { z } from "zod";

export const idParam = z.string().uuid("Id inválido");