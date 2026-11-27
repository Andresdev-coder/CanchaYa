import { describe, expect, it } from "vitest";
import { envSchema } from "../src/config/env.schema";

const base = { DATABASE_URL: "postgresql://x", JWT_SECRET: "a".repeat(32) };
const parse = (extra: Record<string, string | undefined> = {}) => envSchema.parse({ ...base, ...extra });

describe("variables de entorno", () => {
  it("sin las opciones nuevas, no hay proxy medido, los límites están activos y no hay diagnóstico", () => {
    const env = parse();
    expect(env.TRUST_PROXY).toBeUndefined();
    expect(env.RATE_LIMIT_OFF).toBe(false);
    expect(env.IP_DEBUG_TOKEN).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it("una variable vacía en el .env cuenta como no definida", () => {
    const env = parse({ TRUST_PROXY: "", RATE_LIMIT_OFF: "", IP_DEBUG_TOKEN: "" });
    expect(env.TRUST_PROXY).toBeUndefined();
    expect(env.RATE_LIMIT_OFF).toBe(false);
    expect(env.IP_DEBUG_TOKEN).toBeUndefined();
  });

  it("TRUST_PROXY acepta un número de saltos, incluido 0", () => {
    expect(parse({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(parse({ TRUST_PROXY: "3" }).TRUST_PROXY).toBe(3);
    expect(parse({ TRUST_PROXY: "0" }).TRUST_PROXY).toBe(0);
  });

  it.each(["abc", "-1", "11", "1.5", "true"])("TRUST_PROXY rechaza %s", (value) => {
    expect(() => parse({ TRUST_PROXY: value })).toThrow();
  });

  it("RATE_LIMIT_OFF solo acepta true o false", () => {
    expect(parse({ RATE_LIMIT_OFF: "true" }).RATE_LIMIT_OFF).toBe(true);
    expect(parse({ RATE_LIMIT_OFF: "false" }).RATE_LIMIT_OFF).toBe(false);
    expect(() => parse({ RATE_LIMIT_OFF: "si" })).toThrow();
  });

  it("IP_DEBUG_TOKEN exige al menos 16 caracteres", () => {
    expect(parse({ IP_DEBUG_TOKEN: "x".repeat(16) }).IP_DEBUG_TOKEN).toHaveLength(16);
    expect(() => parse({ IP_DEBUG_TOKEN: "corto" })).toThrow();
  });

  it("sigue exigiendo la base de datos y un JWT_SECRET largo", () => {
    expect(() => envSchema.parse({ JWT_SECRET: "a".repeat(32) })).toThrow();
    expect(() => parse({ JWT_SECRET: "corto" })).toThrow();
  });
});
