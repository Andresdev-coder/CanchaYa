import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import type { RateLimiters } from "../../middlewares/rateLimit";
import { changePasswordSchema, loginSchema, registerSchema } from "./auth.schemas";
import * as service from "./auth.service";

export function authRouter(limiters: RateLimiters) {
  const router = Router();

  router.post("/register", limiters.registerGlobal, limiters.registerByIp, async (req, res) => {
    const data = registerSchema.parse(req.body);
    res.status(201).json(await service.register(data));
  });

  router.post("/login", limiters.loginByAccount, limiters.loginByIp, async (req, res) => {
    const data = loginSchema.parse(req.body);
    res.json(await service.login(data));
  });

  router.get("/me", authenticate, async (req, res) => {
    res.json(await service.me(req.user!.id));
  });

  // Después de cambiarla, las sesiones anteriores dejan de servir; la respuesta trae una sesión nueva.
  router.post("/change-password", authenticate, limiters.changePassword, async (req, res) => {
    const data = changePasswordSchema.parse(req.body);
    res.json(await service.changePassword(req.user!.id, data));
  });

  return router;
}
