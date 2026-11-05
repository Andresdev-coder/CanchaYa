import { Router } from "express";
import { availabilityQuerySchema, createPublicBookingSchema, slugParam, tokenParam } from "./public.schemas";
import * as service from "./public.service";

/** Rutas para jugadores: no piden cuenta. */
export const publicRouter = Router();

// El jugador ve y cancela su reserva con el enlace privado (el token).
publicRouter.get("/bookings/:token", async (req, res) => {
  res.json(await service.getByToken(tokenParam.parse(req.params.token)));
});

publicRouter.post("/bookings/:token/cancel", async (req, res) => {
  res.json(await service.cancelByToken(tokenParam.parse(req.params.token)));
});

publicRouter.get("/:slug", async (req, res) => {
  res.json(await service.getPage(slugParam.parse(req.params.slug)));
});

publicRouter.get("/:slug/availability", async (req, res) => {
  const slug = slugParam.parse(req.params.slug);
  const { courtId, date } = availabilityQuerySchema.parse(req.query);
  res.json(await service.availability(slug, courtId, date));
});

publicRouter.post("/:slug/bookings", async (req, res) => {
  const slug = slugParam.parse(req.params.slug);
  const data = createPublicBookingSchema.parse(req.body);
  res.status(201).json(await service.createBooking(slug, data));
});