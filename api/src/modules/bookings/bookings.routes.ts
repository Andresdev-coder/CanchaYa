import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { idParam } from "../../middlewares/params";
import { cancelBookingSchema, listBookingsSchema } from "./bookings.schemas";
import * as service from "./bookings.service";

export const bookingsRouter = Router();

// El dueño y el empleado pueden ver, confirmar y cancelar reservas.
bookingsRouter.use(authenticate);

bookingsRouter.get("/", async (req, res) => {
  const { date, includeCancelled } = listBookingsSchema.parse(req.query);
  res.json(await service.listDay(req.user!.establishmentId, date, includeCancelled === "true"));
});

bookingsRouter.get("/:id", async (req, res) => {
  res.json(await service.get(req.user!.establishmentId, idParam.parse(req.params.id)));
});

bookingsRouter.post("/:id/confirm", async (req, res) => {
  res.json(await service.confirm(req.user!.establishmentId, idParam.parse(req.params.id)));
});

bookingsRouter.post("/:id/cancel", async (req, res) => {
  const data = cancelBookingSchema.parse(req.body ?? {});
  res.json(await service.cancel(req.user!.establishmentId, idParam.parse(req.params.id), data));
});