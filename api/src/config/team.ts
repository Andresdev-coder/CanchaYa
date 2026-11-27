export const TEAM = {
  /** Personas activas (dueño y empleados) por establecimiento. */
  maxActive: 10,
  /** Personas registradas en total, activas o no, para que el equipo no crezca sin fin. */
  maxTotal: 50,
} as const;
