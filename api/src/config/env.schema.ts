import { z } from "zod";

/** Una variable vacía en el .env (`TRUST_PROXY=`) se trata como si no estuviera. */
const blankIsMissing = (value: unknown) => (value === "" ? undefined : value);

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:4200"),

  /**
   * Cuántos proxies hay delante del servidor (el número de saltos que Express debe creer).
   * Sin definirlo, no se activa ningún límite por IP: con un número equivocado, todos los visitantes
   * compartirían un mismo cupo o el límite se podría burlar. Se mide con IP_DEBUG_TOKEN.
   */
  TRUST_PROXY: z.preprocess(blankIsMissing, z.coerce.number().int().min(0).max(10).optional()),

  /** Apaga los límites de intentos (útil en desarrollo). Las pruebas ya corren sin límites. */
  RATE_LIMIT_OFF: z.preprocess(blankIsMissing, z.enum(["true", "false"]).optional()).transform((v) => v === "true"),

  /** Activa /_debug/ip, el diagnóstico para medir los saltos de proxy. Quítalo cuando termines de medir. */
  IP_DEBUG_TOKEN: z.preprocess(blankIsMissing, z.string().min(16, "IP_DEBUG_TOKEN debe tener al menos 16 caracteres").optional()),
});
