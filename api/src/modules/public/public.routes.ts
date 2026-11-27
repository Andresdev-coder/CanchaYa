import { Router } from "express";
import type { RateLimiters } from "../../middlewares/rateLimit";
import { availabilityQuerySchema, createPublicBookingSchema, slugParam, tokenParam } from "./public.schemas";
import * as service from "./public.service";

/** Rutas para jugadores: no piden cuenta. */
export function publicRouter(limiters: RateLimiters) {
  const router = Router();

  // El jugador ve y cancela su reserva con el enlace privado (el token).
  router.get("/bookings/:token", limiters.linkByIp, async (req, res) => {
    res.json(await service.getByToken(tokenParam.parse(req.params.token)));
  });

  router.post("/bookings/:token/cancel", limiters.linkByIp, async (req, res) => {
    res.json(await service.cancelByToken(tokenParam.parse(req.params.token)));
  });

  router.get("/:slug", limiters.publicReadByIp, async (req, res) => {
    res.json(await service.getPage(slugParam.parse(req.params.slug)));
  });

  router.get("/:slug/availability", limiters.publicReadByIp, async (req, res) => {
    const slug = slugParam.parse(req.params.slug);
    const { courtId, date } = availabilityQuerySchema.parse(req.query);
    res.json(await service.availability(slug, courtId, date));
  });

  router.post("/:slug/bookings", limiters.bookByEstablishment, limiters.bookByIp, async (req, res) => {
    const slug = slugParam.parse(req.params.slug);
    const data = createPublicBookingSchema.parse(req.body);
    res.status(201).json(await service.createBooking(slug, data));
  });

  return router;
}
