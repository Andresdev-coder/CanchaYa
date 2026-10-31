import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { loginSchema, registerSchema } from "./auth.schemas";
import * as service from "./auth.service";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);
  res.status(201).json(await service.register(data));
});

authRouter.post("/login", async (req, res) => {
  const data = loginSchema.parse(req.body);
  res.json(await service.login(data));
});

authRouter.get("/me", authenticate, async (req, res) => {
  res.json(await service.me(req.user!.id));
});