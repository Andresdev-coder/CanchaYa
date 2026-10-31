# CanchaYa

Reservas de canchas (fútbol, voleibol y tenis) para establecimientos de Yopal. Cada establecimiento tiene su propia página de reservas, una agenda para su equipo y la configuración de sus canchas y tarifas.

**Estado: fase 1.** Este repositorio contiene el modelo de datos, la regla anti-choque de reservas y la base de la API. El frontend en Angular se agrega en el siguiente paso.

## Fases

1. **Núcleo:** ingreso, establecimientos, canchas y tarifas, horarios disponibles, reservas con regla anti-choque y pagos marcados a mano.
2. Páginas públicas y agenda del dueño.
3. Suscripción manual y panel de CanchaYa.
4. Página de venta y registro autoservicio.
5. Avisos por WhatsApp.
6. Pagos en línea directo al dueño.

## Stack

Angular + TypeScript (frontend, pendiente), Node.js + Express 5 + TypeScript, PostgreSQL 16, Prisma 7 con `@prisma/adapter-pg`, Vitest. Despliegue previsto: Vercel o Render para la web, Render para la API y Neon para la base de datos.

## Primeros pasos

Requisitos: Node 24, pnpm 12 y Docker.

```bash
docker compose up -d                 # PostgreSQL en el puerto 5434 (crea también canchaya_test)
cd api
cp .env.example .env
cp .env.test.example .env.test
```

Dependencias. **Fija Prisma en 7.10.0:** la etiqueta `latest` de npm apunta hoy a una versión candidata de Prisma 8 que cambia el CLI.

```bash
pnpm add express cors helmet zod jsonwebtoken bcrypt dotenv pg @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0
pnpm add -D typescript tsx esbuild vitest supertest dotenv-cli prisma@7.10.0 \
  @types/node @types/express @types/cors @types/jsonwebtoken @types/bcrypt @types/pg @types/supertest
pnpm approve-builds                  # aprueba bcrypt, esbuild, prisma y @prisma/engines
```

### La migración inicial lleva un paso a mano

Prisma genera casi todo el SQL, pero no sabe expresar la regla anti-choque ni las restricciones `CHECK`. Esas están en `api/prisma/sql/booking_rules.sql` y se pegan **al final** de la migración inicial:

```bash
pnpm prisma migrate dev --create-only --name init
# 1. Abre prisma/migrations/<fecha>_init/migration.sql
# 2. Pega AL FINAL todo el contenido de prisma/sql/booking_rules.sql
pnpm prisma migrate dev
pnpm prisma generate
pnpm test:db                         # aplica las migraciones a canchaya_test
pnpm test
pnpm dev                             # http://localhost:3000
```

Si `migrate dev` propone una migración nueva que elimina la regla `Booking_no_overlap` o la extensión `btree_gist`, no la apliques y avísame.

## La regla anti-choque

Si dos personas reservan la misma cancha a la misma hora al mismo tiempo, revisar «¿está libre?» desde el código no alcanza: las dos ven «libre» y las dos guardan. Por eso la prohíbe la base de datos:

```sql
EXCLUDE USING gist ("courtId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
WHERE ("status" IN ('PENDING', 'CONFIRMED'))
```

Una cancha no puede tener dos reservas activas que se crucen. Los rangos son `[inicio, fin)`: una reserva de 7 a 8 y otra de 8 a 9 no se cruzan. Una reserva cancelada deja de bloquear el horario. La API traduce el error de PostgreSQL (código `23P01`) a un 409. `api/tests/booking-rules.test.ts` lo prueba, incluyendo 10 peticiones simultáneas por el mismo horario.

## Modelo de datos

| Modelo | Para qué sirve |
|---|---|
| `Establishment` | El cliente que paga la suscripción. Todo lo demás cuelga de él. |
| `User` | Dueño o empleado, con ingreso por correo y contraseña. |
| `OpeningHour` | Horario de atención por día de la semana. |
| `Court` | Una cancha: deporte, superficie, duración del turno y reglas de abono. |
| `PriceRule` | Tarifa por hora de una cancha en una franja y unos días. |
| `Customer` | Quien reserva. No tiene cuenta: se identifica por su teléfono. |
| `Booking` | Una reserva, con el precio fijado al crearla y un enlace privado para el jugador. |
| `Payment` | Un pago marcado por el establecimiento. No se borra: se anula. |

Decisiones:

- **Todo lleva `establishmentId`** y las llaves compuestas obligan a que una reserva, su cancha y su cliente pertenezcan al mismo establecimiento, también a nivel de base de datos.
- **El precio se guarda en la reserva:** cambiar una tarifa después no altera reservas viejas.
- **Dinero en pesos enteros**, sin decimales.
- **Horarios con zona horaria** (`timestamptz`); Colombia no tiene horario de verano.
- **Los pagos y las reservas no se borran:** se anulan o se cancelan, para poder auditarlos.
- **Las reglas de precios sin cruces** (dos franjas que pisen la misma hora) se validan en la API, no en la base de datos.
