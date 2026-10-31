import { describe, expect, it } from "vitest";
import { slugify } from "../src/utils/slug";

describe("slugify", () => {
  it("quita tildes, eñes y símbolos", () => {
    expect(slugify("Canchas Ñandú — La Pradera")).toBe("canchas-nandu-la-pradera");
  });

  it("recorta a 40 caracteres sin dejar un guion al final", () => {
    const slug = slugify("Complejo Deportivo de Fútbol y Voleibol Los Llanos del Casanare");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("usa un valor por defecto si no queda nada", () => {
    expect(slugify("!!!")).toBe("establecimiento");
  });
});