import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`API corriendo en http://localhost:${env.PORT}`);
});
