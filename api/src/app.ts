import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => res.json({ name: "CanchaYa API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use((_req, res) => res.status(404).json({ message: "Ruta no encontrada" }));
