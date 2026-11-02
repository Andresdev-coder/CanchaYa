export const BOOKING = {
  /** Horas que una reserva "por confirmar" retiene el horario si nadie la atiende. */
  holdHours: 12,
  /** Con cuántos días de anticipación se puede reservar. */
  maxAdvanceDays: 30,
  /** Reservas activas (por confirmar o confirmadas, a futuro) que puede tener un mismo teléfono. */
  maxActivePerPhone: 3,
} as const;