import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const clean = (address: string) => address.replace(/^::ffff:/, "");

/**
 * Para cada número de saltos de proxy, la dirección que Express tomaría como la del visitante.
 * La cadena empieza por la conexión directa y sigue con las entradas de X-Forwarded-For de derecha a izquierda.
 */
export function ipCandidates(socketAddress: string | undefined, forwardedFor: string | undefined, maxHops = 4) {
  const forwarded = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse();
  const chain = [socketAddress ?? "", ...forwarded].map(clean);
  return Array.from({ length: maxHops + 1 }, (_, hops) => ({
    hops,
    ip: chain[Math.min(hops, chain.length - 1)] || null,
  }));
}

function sameToken(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Diagnóstico para medir cuántos proxies hay delante del servidor. Solo existe si se define IP_DEBUG_TOKEN:
 * sin él (o con un token equivocado) responde 404, como cualquier ruta que no existe.
 */
export function ipDebug(token: string | undefined): RequestHandler {
  return (req, res) => {
    const given = req.get("x-debug-token");
    if (!token || !given || !sameToken(given, token)) {
      res.status(404).json({ message: "Ruta no encontrada" });
      return;
    }
    const forwardedFor = req.get("x-forwarded-for");
    res.json({
      socket: clean(req.socket.remoteAddress ?? ""),
      forwardedFor: forwardedFor ?? null,
      trustProxy: req.app.get("trust proxy") as unknown,
      ipSegunLaConfiguracionActual: req.ip ?? null,
      candidatos: ipCandidates(req.socket.remoteAddress, forwardedFor),
    });
  };
}
