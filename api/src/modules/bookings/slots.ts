export type PriceRuleLike = { weekdays: number[]; startMin: number; endMin: number; pricePerHour: number };
export type HoursLike = { opensMin: number; closesMin: number };
export type BookedRange = { startsAt: Date; endsAt: Date };

export type Slot = {
  start: Date;
  end: Date;
  startMin: number;
  endMin: number;
  price: number;
  available: boolean;
};

/** Desfase (en minutos) de una zona horaria respecto a UTC en un instante dado. */
export function tzOffsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wallAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** El instante UTC de una hora local: fecha AAAA-MM-DD y minutos desde la medianoche (1440 = medianoche siguiente). */
export function localToUtc(date: string, minutes: number, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes); // la hora local escrita "como si" fuera UTC
  let instant = wall - tzOffsetMinutes(new Date(wall), timeZone) * 60_000;
  // Segunda pasada: el desfase pudo cambiar entre la estimación y el resultado (cambios de horario).
  instant = wall - tzOffsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** Día de la semana de una fecha de calendario (0 = domingo ... 6 = sábado). No depende de zonas horarias. */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isRealDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** La fecha (AAAA-MM-DD) que marca el reloj en una zona horaria. */
export function dateIn(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

export function daysBetween(from: string, to: string) {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Devuelve un mensaje de error si la fecha no se puede reservar, o null si está bien. */
export function checkBookableDate(date: string, timeZone: string, maxAdvanceDays: number, now = new Date()) {
  if (!isRealDate(date)) return "Fecha inválida";
  const diff = daysBetween(dateIn(timeZone, now), date);
  if (diff < 0) return "Esa fecha ya pasó";
  if (diff > maxAdvanceDays) return `Solo se puede reservar hasta con ${maxAdvanceDays} días de anticipación`;
  return null;
}

/**
 * Precio de un tramo (en pesos) según las franjas del día, o null si alguna parte del tramo no tiene tarifa.
 * Si el tramo cruza dos franjas, cada minuto se cobra a la tarifa de su franja.
 */
export function priceFor(rules: PriceRuleLike[], weekday: number, startMin: number, endMin: number) {
  let covered = 0;
  let weighted = 0; // minutos x precio por hora
  for (const rule of rules) {
    if (!rule.weekdays.includes(weekday)) continue;
    const overlap = Math.min(endMin, rule.endMin) - Math.max(startMin, rule.startMin);
    if (overlap > 0) {
      covered += overlap;
      weighted += overlap * rule.pricePerHour;
    }
  }
  if (covered !== endMin - startMin) return null;
  return Math.round(weighted / 60);
}

type BuildArgs = {
  date: string;
  timeZone: string;
  hours: HoursLike;
  slotMinutes: number;
  rules: PriceRuleLike[];
  booked: BookedRange[];
  now: Date;
};

/** Los turnos de un día: arrancan a la hora de apertura y se repiten cada `slotMinutes` hasta el cierre. */
export function buildSlots({ date, timeZone, hours, slotMinutes, rules, booked, now }: BuildArgs): Slot[] {
  const weekday = weekdayOf(date);
  const slots: Slot[] = [];

  for (let startMin = hours.opensMin; startMin + slotMinutes <= hours.closesMin; startMin += slotMinutes) {
    const endMin = startMin + slotMinutes;

    const price = priceFor(rules, weekday, startMin, endMin);
    if (price === null) continue; // sin tarifa no se ofrece

    const start = localToUtc(date, startMin, timeZone);
    if (start <= now) continue; // ya empezó o pasó

    const end = localToUtc(date, endMin, timeZone);
    const taken = booked.some((b) => b.startsAt < end && b.endsAt > start);
    slots.push({ start, end, startMin, endMin, price, available: !taken });
  }
  return slots;
}