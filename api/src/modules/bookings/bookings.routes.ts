import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/auth";
import { idParam } from "../../middlewares/params";
import {
  cancelBookingSchema,
  createManualBookingSchema,
  createPaymentSchema,
  listBookingsSchema,
  voidPaymentSchema,
} from "./bookings.schemas";
import * as service from "./bookings.service";
import * as payments from "./payments.service";

export const bookingsRouter = Router();

// El dueño y el empleado pueden ver, crear, confirmar, cancelar y cobrar. Solo el dueño anula pagos.
bookingsRouter.use(authenticate);

bookingsRouter.get("/", async (req, res) => {
  const { date, includeCancelled } = listBookingsSchema.parse(req.query);
  res.json(await service.listDay(req.user!.establishmentId, date, includeCancelled === "true"));
});

bookingsRouter.post("/", async (req, res) => {
  const data = createManualBookingSchema.parse(req.body);
  res.status(201).json(await service.createManual(req.user!.establishmentId, data));
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

bookingsRouter.post("/:id/complete", async (req, res) => {
  res.json(await service.finish(req.user!.establishmentId, idParam.parse(req.params.id), "COMPLETED"));
});

bookingsRouter.post("/:id/no-show", async (req, res) => {
  res.json(await service.finish(req.user!.establishmentId, idParam.parse(req.params.id), "NO_SHOW"));
});

bookingsRouter.post("/:id/payments", async (req, res) => {
  const data = createPaymentSchema.parse(req.body);
  const { establishmentId, id: userId } = req.user!;
  res.status(201).json(await payments.record(establishmentId, userId, idParam.parse(req.params.id), data));
});

bookingsRouter.post("/:id/payments/:paymentId/void", requireRole("OWNER"), async (req, res) => {
  const { reason } = voidPaymentSchema.parse(req.body);
  res.json(
    await payments.voidPayment(
      req.user!.establishmentId,
      idParam.parse(req.params.id),
      idParam.parse(req.params.paymentId),
      reason,
    ),
  );
});