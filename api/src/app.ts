import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { createRateLimiters, type RateLimitOptions } from "./middlewares/rateLimit";
import { authRouter } from "./modules/auth/auth.routes";
import { bookingsRouter } from "./modules/bookings/bookings.routes";
import { courtsRouter } from "./modules/courts/courts.routes";
import { establishmentsRouter } from "./modules/establishments/establishments.routes";
import { publicRouter } from "./modules/public/public.routes";
import { usersRouter } from "./modules/users/users.routes";
import { ipDebug } from "./utils/ip";

export interface AppOptions {
  /** Para las pruebas de los límites: cambia lo que dicen las variables de entorno. */
  rateLimit?: RateLimitOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  // Cuántos proxies hay delante del servidor. Sin medirlo no se activa ningún límite por IP.
  if (env.TRUST_PROXY !== undefined) app.set("trust proxy", env.TRUST_PROXY);

  const limiters = createRateLimiters({
    // Las pruebas corren sin límites, salvo las que los piden a propósito.
    disabled: env.RATE_LIMIT_OFF || process.env["NODE_ENV"] === "test",
    ipLimits: env.TRUST_PROXY !== undefined,
    ...options.rateLimit,
  });

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (_req, res) => res.json({ name: "CanchaYa API", status: "ok" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  // Responde 404 salvo que IP_DEBUG_TOKEN esté definido y el token coincida.
  app.get("/_debug/ip", ipDebug(env.IP_DEBUG_TOKEN));

  app.use("/auth", authRouter(limiters));
  app.use("/establishment", establishmentsRouter);
  app.use("/courts", courtsRouter);
  app.use("/bookings", bookingsRouter);
  app.use("/users", usersRouter);
  app.use("/public", publicRouter(limiters));

  app.use((_req, res) => res.status(404).json({ message: "Ruta no encontrada" }));
  app.use(errorHandler); // siempre al final
  return app;
}

export const app = createApp();
