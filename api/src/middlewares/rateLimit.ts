import type { Request, RequestHandler } from "express";
import { HOUR, MINUTE, ipKeyGenerator, rateLimit } from "express-rate-limit";

export interface RateLimitOptions {
  /** Apaga todos los límites. Es lo que usan las pruebas. */
  disabled?: boolean;
  /**
   * Activa los límites por IP. Solo es seguro cuando 'trust proxy' está medido para el despliegue:
   * con un número equivocado, todos los visitantes comparten un mismo cupo o el límite se puede burlar.
   */
  ipLimits?: boolean;
}

interface LimiterConfig {
  windowMs: number;
  limit: number;
  key: (req: Request) => string;
  /** Solo cuentan las respuestas con error (los ingresos correctos no gastan el cupo). */
  failuresOnly?: boolean;
  /**
   * Solo cuentan las respuestas correctas. Para topes que protegen un recurso de todos (un establecimiento, los registros):
   * si contaran también los errores, cualquiera podría gastarlos con peticiones basura y dejar sin servicio a los demás.
   */
  successesOnly?: boolean;
  /** Los límites por IP solo se activan con `ipLimits`. */
  byIp?: boolean;
  skip?: (req: Request) => boolean;
}

function waitText(req: Request) {
  const info = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
  const seconds = Math.max(1, Math.ceil(((info?.resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000));
  if (seconds <= 90) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

const emailOf = (req: Request) =>
  typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? "desconocida");

export function createRateLimiters({ disabled = false, ipLimits = false }: RateLimitOptions = {}) {
  const make = (config: LimiterConfig): RequestHandler => {
    if (disabled || (config.byIp && !ipLimits)) return (_req, _res, next) => next();
    return rateLimit({
      windowMs: config.windowMs,
      limit: config.limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skipSuccessfulRequests: config.failuresOnly ?? false,
      skipFailedRequests: config.successesOnly ?? false,
      keyGenerator: config.key,
      skip: config.skip,
      handler: (req, res) => {
        res
          .status(429)
          .json({ message: `Demasiados intentos. Espera ${waitText(req)} e inténtalo de nuevo.` });
      },
    });
  };

  return {
    // --- Por cuenta, por establecimiento o globales: no dependen de la IP y siempre están activos ---
    loginByAccount: make({
      windowMs: 15 * MINUTE,
      limit: 5,
      failuresOnly: true,
      key: emailOf,
      skip: (req) => emailOf(req) === "",
    }),
    // Cortafuegos contra registros masivos. Muy por encima del uso real, y solo cuenta registros que sí se crearon.
    registerGlobal: make({ windowMs: HOUR, limit: 200, successesOnly: true, key: () => "global" }),
    changePassword: make({
      windowMs: 15 * MINUTE,
      limit: 5,
      failuresOnly: true,
      key: (req) => req.user?.id ?? "",
      skip: (req) => !req.user,
    }),
    // Cortafuegos contra inundar a un establecimiento. Solo cuenta solicitudes que sí se crearon.
    bookByEstablishment: make({
      windowMs: HOUR,
      limit: 100,
      successesOnly: true,
      key: (req) => String(req.params["slug"] ?? ""),
    }),

    // --- Por IP: solo con `ipLimits` ---
    loginByIp: make({ windowMs: 15 * MINUTE, limit: 50, failuresOnly: true, key: clientIp, byIp: true }),
    registerByIp: make({ windowMs: HOUR, limit: 10, key: clientIp, byIp: true }),
    publicReadByIp: make({ windowMs: MINUTE, limit: 120, key: clientIp, byIp: true }),
    bookByIp: make({ windowMs: 10 * MINUTE, limit: 20, key: clientIp, byIp: true }),
    linkByIp: make({ windowMs: MINUTE, limit: 60, key: clientIp, byIp: true }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
