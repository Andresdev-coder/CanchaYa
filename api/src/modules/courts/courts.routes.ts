import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/auth";
import { idParam } from "../../middlewares/params";
import { createCourtSchema, listCourtsSchema, setPricesSchema, updateCourtSchema } from "./courts.schemas";
import * as service from "./courts.service";

export const courtsRouter = Router();

courtsRouter.use(authenticate);

courtsRouter.get("/", async (req, res) => {
  const { includeInactive } = listCourtsSchema.parse(req.query);
  res.json(await service.list(req.user!.establishmentId, includeInactive === "true"));
});

courtsRouter.post("/", requireRole("OWNER"), async (req, res) => {
  const data = createCourtSchema.parse(req.body);
  res.status(201).json(await service.create(req.user!.establishmentId, data));
});

courtsRouter.get("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  res.json(await service.get(req.user!.establishmentId, id));
});

courtsRouter.patch("/:id", requireRole("OWNER"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = updateCourtSchema.parse(req.body);
  res.json(await service.update(req.user!.establishmentId, id, data));
});

courtsRouter.get("/:id/prices", async (req, res) => {
  const id = idParam.parse(req.params.id);
  res.json(await service.listPrices(req.user!.establishmentId, id));
});

courtsRouter.put("/:id/prices", requireRole("OWNER"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = setPricesSchema.parse(req.body);
  res.json(await service.setPrices(req.user!.establishmentId, id, data));
});