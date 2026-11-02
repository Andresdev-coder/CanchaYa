import { Router } from "express";
import { availabilityQuerySchema, createPublicBookingSchema, slugParam } from "./public.schemas";
import * as service from "./public.service";

/** Rutas para jugadores: no piden cuenta. */
export const publicRouter = Router();

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