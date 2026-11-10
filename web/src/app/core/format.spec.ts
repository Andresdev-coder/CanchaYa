import { addDays, formatClock, formatCOP, initials, isMobilePhone, nextDays, normalizePhone, to12h, waLink } from './format';

const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formato', () => {
  it('muestra los pesos colombianos sin decimales', () => {
    expect(plain(formatCOP(90000))).toBe('$ 90.000');
  });

  it('convierte horas de 24 a 12', () => {
    expect(to12h('19:00')).toBe('7:00 pm');
    expect(to12h('06:30')).toBe('6:30 am');
    expect(to12h('12:00')).toBe('12:00 pm');
    expect(to12h('24:00')).toBe('12:00 am');
  });

  it('muestra la hora de Bogotá, no la del navegador', () => {
    expect(formatClock('2026-10-30T00:00:00.000Z')).toBe('7:00 pm');
    expect(formatClock('2026-10-29T12:30:00.000Z')).toBe('7:30 am');
    expect(formatClock('2026-10-30T05:00:00.000Z')).toBe('12:00 am');
  });

  it('suma días sin saltarse el cambio de mes ni de año', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('arma los próximos días empezando por hoy', () => {
    const days = nextDays(3, '2026-10-29');
    expect(days.map((d) => d.value)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
    expect(days[0].weekday).toBe('Hoy');
    expect(days[1].weekday).toBe('Vie');
    expect(days.map((d) => d.day)).toEqual([29, 30, 31]);
  });
});

describe('celular', () => {
  it('acepta las formas habituales de escribirlo', () => {
    expect(normalizePhone('+57 310 123-4567')).toBe('3101234567');
    expect(isMobilePhone('310 123 4567')).toBe(true);
    expect(isMobilePhone('573101234567')).toBe(true);
  });

  it('rechaza lo que no es un celular', () => {
    expect(isMobilePhone('6081234567')).toBe(false);
    expect(isMobilePhone('310123')).toBe(false);
    expect(isMobilePhone('')).toBe(false);
  });
});

describe('WhatsApp y nombres', () => {
  it('arma el enlace con el prefijo de Colombia y el texto codificado', () => {
    expect(waLink('310 123 4567', 'Hola, ¿cómo vas?')).toBe(
      'https://wa.me/573101234567?text=Hola%2C%20%C2%BFc%C3%B3mo%20vas%3F',
    );
  });

  it('no hay enlace sin número', () => {
    expect(waLink(null, 'Hola')).toBeNull();
  });

  it('saca las iniciales', () => {
    expect(initials('Complejo Los Llanos')).toBe('CL');
    expect(initials('Pepe')).toBe('P');
  });
});
