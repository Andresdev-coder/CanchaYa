import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/utils/phone";

describe("normalizePhone", () => {
  it("deja solo los dígitos", () => {
    expect(normalizePhone("310 123-4567")).toBe("3101234567");
  });
  it("quita el prefijo de Colombia", () => {
    expect(normalizePhone("+57 310 123 4567")).toBe("3101234567");
    expect(normalizePhone("573101234567")).toBe("3101234567");
  });
  it("no toca los números que ya están bien", () => {
    expect(normalizePhone("3101234567")).toBe("3101234567");
  });
});