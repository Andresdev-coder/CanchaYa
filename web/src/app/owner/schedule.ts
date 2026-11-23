import { timeToMin } from '../core/format';

/** Los días en el orden en que se muestran (lunes primero). El número es el de la API: 0 = domingo. */
export const WEEK = [
  { value: 1, short: 'Lun', long: 'Lunes' },
  { value: 2, short: 'Mar', long: 'Martes' },
  { value: 3, short: 'Mié', long: 'Miércoles' },
  { value: 4, short: 'Jue', long: 'Jueves' },
  { value: 5, short: 'Vie', long: 'Viernes' },
  { value: 6, short: 'Sáb', long: 'Sábado' },
  { value: 0, short: 'Dom', long: 'Domingo' },
] as const;

const ORDER: number[] = WEEK.map((d) => d.value);
const SHORT = new Map<number, string>(WEEK.map((d) => [d.value, d.short]));
const pad = (n: number) => String(n).padStart(2, '0');

/** Horas cada 30 minutos. Para "hasta", de 00:30 a 24:00 (24:00 es la medianoche). */
export function timeOptions(kind: 'start' | 'end') {
  const from = kind === 'start' ? 0 : 30;
  const to = kind === 'start' ? 1410 : 1440;
  const options: string[] = [];
  for (let m = from; m <= to; m += 30) options.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return options;
}

/** Si el valor guardado no está en la lista (por ejemplo 06:15), se agrega para no perderlo. */
export function withCurrent(options: string[], current: string) {
  if (!current || options.includes(current)) return options;
  return [...options, current].sort();
}

export interface RuleLike {
  weekdays: number[];
  start: string;
  end: string;
  price: string | number;
}

/** Dos franjas se cruzan si, un mismo día, una empieza antes de que termine la anterior. Pegadas no se cruzan. */
export function rulesOverlap(rules: Pick<RuleLike, 'weekdays' | 'start' | 'end'>[]) {
  for (let day = 0; day <= 6; day++) {
    const spans = rules
      .filter((r) => r.weekdays.includes(day))
      .map((r) => [timeToMin(r.start), timeToMin(r.end)])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] < spans[i - 1][1]) return true;
    }
  }
  return false;
}

/** El primer problema que impide guardar las franjas, o null si están bien. */
export function validateRules(rules: RuleLike[]) {
  for (const r of rules) {
    if (r.weekdays.length === 0) return 'Cada franja necesita al menos un día.';
    if (timeToMin(r.start) >= timeToMin(r.end)) return 'En cada franja, la hora de inicio debe ser menor que la de fin.';
    const price = Number(r.price);
    if (!Number.isInteger(price) || price < 1) return 'Escribe el precio por hora de cada franja.';
  }
  if (rulesOverlap(rules)) return 'Hay franjas que se cruzan el mismo día.';
  return null;
}

/** [1,2,3,4,5] -> "Lun a Vie"; [6,0] -> "Sáb y Dom"; los siete -> "Todos los días". */
export function summarizeDays(weekdays: number[]) {
  const days = [...new Set(weekdays)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (days.length === 0) return 'Ningún día';
  if (days.length === 7) return 'Todos los días';

  const runs: number[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && ORDER.indexOf(day) === ORDER.indexOf(last[last.length - 1]) + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) => {
      const names = run.map((d) => SHORT.get(d)!);
      if (names.length >= 3) return `${names[0]} a ${names[names.length - 1]}`;
      return names.join(' y ');
    })
    .join(', ');
}
