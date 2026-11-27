import { generatePassword } from './password';

describe('generatePassword', () => {
  it('tiene 10 caracteres por defecto, o los que se pidan', () => {
    expect(generatePassword()).toHaveLength(10);
    expect(generatePassword(16)).toHaveLength(16);
  });

  it('nunca usa caracteres que se confunden al leerlos', () => {
    for (let i = 0; i < 300; i++) expect(generatePassword(20)).not.toMatch(/[0O1lI]/);
  });

  it('solo usa letras y números', () => {
    for (let i = 0; i < 100; i++) expect(generatePassword()).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('no repite: cada una sale distinta', () => {
    const all = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(all.size).toBe(200);
  });

  it('reparte los caracteres sin favorecer a los primeros', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const c of generatePassword(10)) counts.set(c, (counts.get(c) ?? 0) + 1);
    const values = [...counts.values()];
    expect(counts.size).toBe(55);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.25);
  });
});
