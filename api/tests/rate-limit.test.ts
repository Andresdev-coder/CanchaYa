import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRateLimiters, type RateLimitOptions } from "../src/middlewares/rateLimit";
import { ipCandidates, ipDebug } from "../src/utils/ip";

/** Una aplicación mínima con las mismas rutas protegidas que la real, sin base de datos. */
function appWith(options: RateLimitOptions, trustProxy?: number) {
  const l = createRateLimiters(options);
  const app = express();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
  app.use(express.json());
  // Simula a un usuario con sesión, para el límite de cambio de contraseña.
  app.use((req, _res, next) => {
    const id = req.get("x-user");
    if (id) req.user = { id, establishmentId: "e1", role: "OWNER" };
    next();
  });

  app.post("/auth/login", l.loginByAccount, l.loginByIp, (req, res) =>
    req.body?.password === "bien" ? res.json({ token: "t" }) : res.status(401).json({ message: "Correo o contraseña incorrectos" }),
  );
  app.post("/auth/register", l.registerGlobal, l.registerByIp, (req, res) => (req.body?.bad ? res.status(400).json({}) : res.status(201).json({})));
  app.post("/auth/change-password", l.changePassword, (req, res) =>
    req.body?.currentPassword === "bien" ? res.json({}) : res.status(400).json({ message: "La contraseña actual no es correcta" }),
  );
  app.get("/public/:slug", l.publicReadByIp, (_req, res) => res.json({}));
  app.post("/public/:slug/bookings", l.bookByEstablishment, l.bookByIp, (req, res) => (req.body?.bad ? res.status(400).json({}) : res.status(201).json({})));
  app.get("/public/bookings/:token", l.linkByIp, (_req, res) => res.json({}));
  app.get("/_debug/ip", ipDebug("secreto"));
  return app;
}

const login = (app: express.Express, email: string, password = "mala", ip?: string) => {
  const req = request(app).post("/auth/login").send({ email, password });
  return ip ? req.set("X-Forwarded-For", ip) : req;
};

describe("ingreso: límite por cuenta", () => {
  it("el sexto intento fallido de una misma cuenta recibe 429 con el tiempo de espera", async () => {
    const app = appWith({});
    for (let i = 0; i < 5; i++) expect((await login(app, "a@test.com")).status).toBe(401);

    const blocked = await login(app, "a@test.com");
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/^Demasiados intentos\. Espera \d+ (minutos?|segundos?) e inténtalo de nuevo\.$/);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("el bloqueo vale también para la contraseña correcta: no se puede probar claves sin límite", async () => {
    const app = appWith({});
    for (let i = 0; i < 5; i++) await login(app, "a@test.com");
    expect((await login(app, "a@test.com", "bien")).status).toBe(429);
  });

  it("otra cuenta no se ve afectada", async () => {
    const app = appWith({});
    for (let i = 0; i < 6; i++) await login(app, "a@test.com");
    expect((await login(app, "b@test.com")).status).toBe(401);
  });

  it("el correo se compara sin mayúsculas ni espacios", async () => {
    const app = appWith({});
    for (let i = 0; i < 5; i++) await login(app, i % 2 ? " A@Test.com " : "a@test.com");
    expect((await login(app, "A@TEST.COM")).status).toBe(429);
  });

  it("los ingresos correctos no gastan el cupo", async () => {
    const app = appWith({});
    for (let i = 0; i < 4; i++) await login(app, "a@test.com");
    for (let i = 0; i < 20; i++) expect((await login(app, "a@test.com", "bien")).status).toBe(200);
    expect((await login(app, "a@test.com")).status).toBe(401); // sigue habiendo un intento fallido disponible
  });

  it("una petición sin correo no entra al límite por cuenta", async () => {
    const app = appWith({});
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post("/auth/login").send({ password: "mala" })).status).toBe(401);
    }
  });
});

describe("límites apagados", () => {
  it("con disabled no se limita nada (así corren las pruebas de la aplicación)", async () => {
    const app = appWith({ disabled: true, ipLimits: true });
    for (let i = 0; i < 30; i++) expect((await login(app, "a@test.com")).status).toBe(401);
  });
});

describe("límites por IP", () => {
  it("sin ipLimits (proxy sin medir) no se aplica ninguno, para no juntar a todos los jugadores en un cupo", async () => {
    const app = appWith({ ipLimits: false });
    for (let i = 0; i < 25; i++) expect((await request(app).post("/public/los-llanos/bookings").send({})).status).toBe(201);
  });

  it("con ipLimits, cada IP tiene su cupo", async () => {
    const app = appWith({ ipLimits: true }, 1);
    for (let i = 0; i < 20; i++) {
      expect((await request(app).post(`/public/club-${i}/bookings`).set("X-Forwarded-For", "9.9.9.9").send({})).status).toBe(201);
    }
    expect((await request(app).post("/public/club-x/bookings").set("X-Forwarded-For", "9.9.9.9").send({})).status).toBe(429);
    expect((await request(app).post("/public/club-x/bookings").set("X-Forwarded-For", "8.8.8.8").send({})).status).toBe(201);
  });

  it("con el número de saltos bien medido, falsificar X-Forwarded-For no sirve para burlar el límite", async () => {
    const app = appWith({ ipLimits: true }, 1);
    for (let i = 0; i < 20; i++) {
      await request(app).post(`/public/club-${i}/bookings`).set("X-Forwarded-For", `1.1.1.${i}, 9.9.9.9`).send({});
    }
    // El atacante antepone una IP distinta en cada petición; el proxy agrega la real al final.
    const res = await request(app).post("/public/club-x/bookings").set("X-Forwarded-For", "7.7.7.7, 9.9.9.9").send({});
    expect(res.status).toBe(429);
  });

  it("el ingreso por IP corta los intentos masivos con correos distintos", async () => {
    const app = appWith({ ipLimits: true }, 1);
    for (let i = 0; i < 50; i++) expect((await login(app, `u${i}@test.com`, "mala", "9.9.9.9")).status).toBe(401);
    expect((await login(app, "otro@test.com", "mala", "9.9.9.9")).status).toBe(429);
    expect((await login(app, "otro@test.com", "mala", "8.8.8.8")).status).toBe(401);
  });

  it("el enlace de la reserva y la lectura pública tienen su propio cupo por IP", async () => {
    const app = appWith({ ipLimits: true }, 1);
    for (let i = 0; i < 60; i++) await request(app).get("/public/bookings/abc").set("X-Forwarded-For", "9.9.9.9");
    expect((await request(app).get("/public/bookings/abc").set("X-Forwarded-For", "9.9.9.9")).status).toBe(429);
    // La lectura de la página pública es otro cupo, así que sigue disponible.
    expect((await request(app).get("/public/los-llanos").set("X-Forwarded-For", "9.9.9.9")).status).toBe(200);
  });
});

describe("límites por establecimiento y globales", () => {
  it("un establecimiento no puede recibir más de 100 solicitudes de reserva por hora", async () => {
    const app = appWith({});
    for (let i = 0; i < 100; i++) expect((await request(app).post("/public/los-llanos/bookings").send({})).status).toBe(201);
    expect((await request(app).post("/public/los-llanos/bookings").send({})).status).toBe(429);
    expect((await request(app).post("/public/otro-club/bookings").send({})).status).toBe(201);
  });

  it("las solicitudes que fallan no gastan el tope: nadie puede dejar sin reservas a un establecimiento con peticiones basura", async () => {
    const app = appWith({});
    for (let i = 0; i < 150; i++) expect((await request(app).post("/public/los-llanos/bookings").send({ bad: true })).status).toBe(400);
    expect((await request(app).post("/public/los-llanos/bookings").send({})).status).toBe(201);
  });

  it("los registros tienen un tope global por hora, y solo cuentan los que sí se crearon", async () => {
    const app = appWith({});
    for (let i = 0; i < 250; i++) await request(app).post("/auth/register").send({ bad: true });
    for (let i = 0; i < 200; i++) expect((await request(app).post("/auth/register").send({})).status).toBe(201);
    expect((await request(app).post("/auth/register").send({})).status).toBe(429);
  });

  it("cambiar la contraseña: cinco claves actuales equivocadas bloquean a ese usuario, y solo a él", async () => {
    const app = appWith({});
    const change = (user: string, currentPassword = "mala") =>
      request(app).post("/auth/change-password").set("x-user", user).send({ currentPassword });
    for (let i = 0; i < 5; i++) expect((await change("u1")).status).toBe(400);
    expect((await change("u1")).status).toBe(429);
    expect((await change("u1", "bien")).status).toBe(429);
    expect((await change("u2")).status).toBe(400);
  });
});

describe("medir los saltos de proxy", () => {
  it("arma la cadena desde la conexión directa y X-Forwarded-For de derecha a izquierda", () => {
    const result = ipCandidates("::ffff:10.0.0.5", "1.2.3.4, 9.9.9.9, 10.0.0.2");
    expect(result.map((c) => c.ip)).toEqual(["10.0.0.5", "10.0.0.2", "9.9.9.9", "1.2.3.4", "1.2.3.4"]);
  });

  it("sin X-Forwarded-For todos los candidatos son la conexión directa", () => {
    expect(ipCandidates("10.0.0.5", undefined).every((c) => c.ip === "10.0.0.5")).toBe(true);
  });

  it("responde 404 sin token, con un token equivocado, o si el diagnóstico no está habilitado", async () => {
    const app = appWith({});
    expect((await request(app).get("/_debug/ip")).status).toBe(404);
    expect((await request(app).get("/_debug/ip").set("x-debug-token", "otro")).status).toBe(404);

    const off = express();
    off.get("/_debug/ip", ipDebug(undefined));
    expect((await request(off).get("/_debug/ip").set("x-debug-token", "secreto")).status).toBe(404);
  });

  it("con el token correcto muestra la cadena y la IP según la configuración actual", async () => {
    const app = appWith({}, 1);
    const res = await request(app).get("/_debug/ip").set("x-debug-token", "secreto").set("X-Forwarded-For", "9.9.9.9");
    expect(res.status).toBe(200);
    expect(res.body.ipSegunLaConfiguracionActual).toBe("9.9.9.9");
    expect(res.body.forwardedFor).toBe("9.9.9.9");
    expect(res.body.candidatos[1].ip).toBe("9.9.9.9");
  });
});
