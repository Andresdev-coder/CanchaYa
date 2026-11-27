import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`API corriendo en http://localhost:${env.PORT}`);
  if (env.TRUST_PROXY === undefined && !env.RATE_LIMIT_OFF) {
    console.warn(
      "Aviso: TRUST_PROXY no está definido, así que los límites por IP están desactivados. Los límites por cuenta sí funcionan.",
    );
  }
  if (env.IP_DEBUG_TOKEN) {
    console.warn("Aviso: IP_DEBUG_TOKEN está definido, así que /_debug/ip está habilitado. Quítalo al terminar de medir.");
  }
});
