import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/auth";
import { idParam } from "../../middlewares/params";
import { createUserSchema, updateUserSchema } from "./users.schemas";
import * as service from "./users.service";

export const usersRouter = Router();

// El equipo lo administra solo el dueño.
usersRouter.use(authenticate, requireRole("OWNER"));

usersRouter.get("/", async (req, res) => {
  res.json(await service.list(req.user!.establishmentId));
});

usersRouter.post("/", async (req, res) => {
  const data = createUserSchema.parse(req.body);
  res.status(201).json(await service.create(req.user!.establishmentId, data));
});

usersRouter.patch("/:id", async (req, res) => {
  const id = idParam.parse(req.params.id);
  const data = updateUserSchema.parse(req.body);
  res.json(await service.update(req.user!.establishmentId, id, data));
});
