/** "Canchas Ñandú — La Pradera" -> "canchas-nandu-la-pradera" */
export function slugify(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "establecimiento"
  );
}

/** Direcciones que no se pueden dar a un establecimiento porque serán rutas de la aplicación. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "r", "ingresar", "registro", "precios", "login", "health", "bookings", "reservas",
]);