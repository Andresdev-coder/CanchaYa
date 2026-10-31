import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { establishmentsRouter } from "./modules/establishments/establishments.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => res.json({ name: "CanchaYa API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/establishment", establishmentsRouter);

app.use((_req, res) => res.status(404).json({ message: "Ruta no encontrada" }));
app.use(errorHandler); // siempre al final