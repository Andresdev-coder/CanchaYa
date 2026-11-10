import type { PaymentChoice, Sport } from './models';

const TZ = 'America/Bogota';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatCOP = (value: number) => cop.format(value);

export const SPORT_LABEL: Record<Sport, string> = {
  FOOTBALL: 'Fútbol',
  VOLLEYBALL: 'Voleibol',
  TENNIS: 'Tenis',
  OTHER: 'Otro',
};

export const PAYMENT_LABEL: Record<PaymentChoice, string> = {
  AT_COURT: 'En la cancha',
  DEPOSIT: 'Abono',
  FULL: 'Pago total',
};

/** La fecha (AAAA-MM-DD) que marca el reloj en Colombia. */
export function bogotaDate(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface DayOption {
  value: string;
  weekday: string;
  day: number;
}

/** Los próximos días, empezando por hoy, para elegir la fecha. */
export function nextDays(count: number, from = bogotaDate()): DayOption[] {
  const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: count }, (_, i) => {
    const value = addDays(from, i);
    const date = new Date(`${value}T00:00:00Z`);
    const name = weekday.format(date).replace('.', '');
    return { value, weekday: i === 0 ? 'Hoy' : name.charAt(0).toUpperCase() + name.slice(1), day: date.getUTCDate() };
  });
}

export function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatClock(iso: string) {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  }).format(new Date(iso));
  return to12h(time);
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
}

/** Celular colombiano: 10 dígitos que empiezan por 3. */
export function isMobilePhone(value: string) {
  return /^3\d{9}$/.test(normalizePhone(value));
}

/** Enlace para abrir WhatsApp con un mensaje escrito. Devuelve null si no hay número. */
export function waLink(phone: string | null, text: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `57${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** "19:00" -> "7:00 pm", "24:00" -> "12:00 am". */
export function to12h(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h % 24 >= 12 ? 'pm' : 'am'}`;
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
