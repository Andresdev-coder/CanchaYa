import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/auth";
import { updateEstablishmentSchema } from "./establishments.schemas";
import * as service from "./establishments.service";

export const establishmentsRouter = Router();

establishmentsRouter.use(authenticate);

establishmentsRouter.get("/", async (req, res) => {
  res.json(await service.get(req.user!.establishmentId));
});

establishmentsRouter.patch("/", requireRole("OWNER"), async (req, res) => {
  const data = updateEstablishmentSchema.parse(req.body);
  res.json(await service.update(req.user!.establishmentId, data));
});