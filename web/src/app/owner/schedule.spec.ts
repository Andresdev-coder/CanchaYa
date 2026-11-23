import { rulesOverlap, summarizeDays, timeOptions, validateRules, withCurrent } from './schedule';

const rule = (over: Partial<{ weekdays: number[]; start: string; end: string; price: string | number }> = {}) => ({
  weekdays: [1, 2, 3, 4, 5], start: '06:00', end: '17:00', price: '70000', ...over,
});

describe('horas para elegir', () => {
  it('"desde" va de 00:00 a 23:30, cada media hora', () => {
    const options = timeOptions('start');
    expect(options[0]).toBe('00:00');
    expect(options.at(-1)).toBe('23:30');
    expect(options).toHaveLength(48);
  });

  it('"hasta" va de 00:30 a 24:00, para poder cerrar a medianoche', () => {
    const options = timeOptions('end');
    expect(options[0]).toBe('00:30');
    expect(options.at(-1)).toBe('24:00');
  });

  it('un valor guardado que no está en la lista se conserva', () => {
    expect(withCurrent(timeOptions('start'), '06:15')).toContain('06:15');
    expect(withCurrent(['06:00', '07:00'], '06:15')).toEqual(['06:00', '06:15', '07:00']);
    expect(withCurrent(['06:00'], '06:00')).toEqual(['06:00']);
  });
});

describe('franjas de precio', () => {
  it('franjas pegadas no se cruzan, pero sí si se pisan un mismo día', () => {
    expect(rulesOverlap([rule(), rule({ start: '17:00', end: '22:00' })])).toBe(false);
    expect(rulesOverlap([rule(), rule({ start: '16:00', end: '22:00' })])).toBe(true);
  });

  it('el mismo horario en días distintos no es un cruce', () => {
    expect(rulesOverlap([rule(), rule({ weekdays: [6, 0] })])).toBe(false);
    expect(rulesOverlap([rule(), rule({ weekdays: [5, 6] })])).toBe(true);
  });

  it('acepta franjas correctas', () => {
    expect(validateRules([rule(), rule({ start: '17:00', end: '24:00', price: 90000 })])).toBeNull();
    expect(validateRules([])).toBeNull();
  });

  it('explica el primer problema', () => {
    expect(validateRules([rule({ weekdays: [] })])).toMatch(/al menos un día/);
    expect(validateRules([rule({ start: '17:00', end: '06:00' })])).toMatch(/inicio debe ser menor/);
    expect(validateRules([rule({ start: '10:00', end: '10:00' })])).toMatch(/inicio debe ser menor/);
    expect(validateRules([rule({ price: '' })])).toMatch(/precio/);
    expect(validateRules([rule({ price: '0' })])).toMatch(/precio/);
    expect(validateRules([rule({ price: '70000.5' })])).toMatch(/precio/);
    expect(validateRules([rule(), rule({ end: '18:00' })])).toMatch(/se cruzan/);
  });
});

describe('resumen de días', () => {
  it('agrupa los días seguidos', () => {
    expect(summarizeDays([1, 2, 3, 4, 5])).toBe('Lun a Vie');
    expect(summarizeDays([5, 4, 3, 2, 1])).toBe('Lun a Vie');
    expect(summarizeDays([6, 0])).toBe('Sáb y Dom');
    expect(summarizeDays([1, 3, 5])).toBe('Lun, Mié, Vie');
    expect(summarizeDays([1, 2, 3, 4, 5, 6, 0])).toBe('Todos los días');
    expect(summarizeDays([4])).toBe('Jue');
    expect(summarizeDays([])).toBe('Ningún día');
  });
});
