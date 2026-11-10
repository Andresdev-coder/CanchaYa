# CanchaYa: web

Frontend en Angular 22 (zoneless, con renderizado en servidor) y Tailwind CSS 4.

## Desarrollo

```bash
pnpm install
pnpm start          # http://localhost:4200 (la API debe estar en http://localhost:3000)
pnpm test           # pruebas con Vitest
pnpm build          # compilación de producción en dist/web
```

## Rutas

| Ruta | Qué muestra | Cómo se renderiza |
|---|---|---|
| `/` | Portada | Se genera al compilar |
| `/:slug` | Página de reservas de un establecimiento | En el servidor, en cada petición (así WhatsApp ve su nombre) |
| `/r/:token` | Enlace privado de una reserva | Solo en el navegador (tiene datos de una persona) |

## Producción

- Cambia `apiUrl` y `siteUrl` en `src/environments/environment.ts`.
- **El servidor rechaza los dominios que no declares.** Define `NG_ALLOWED_HOSTS` con los dominios del sitio, separados por coma, por ejemplo `NG_ALLOWED_HOSTS=canchaya.co,www.canchaya.co`.
- Arranque: `pnpm build` y luego `node dist/web/server/server.mjs` (usa la variable `PORT`).
