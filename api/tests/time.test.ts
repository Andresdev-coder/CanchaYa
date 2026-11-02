import { describe, expect, it } from "vitest";
import { formatTime, parseTime } from "../src/utils/time";

describe("horas", () => {
  it("convierte entre HH:MM y minutos", () => {
    expect(parseTime("06:00")).toBe(360);
    expect(parseTime("22:30")).toBe(1350);
    expect(formatTime(360)).toBe("06:00");
    expect(formatTime(1350)).toBe("22:30");
  });

  it("24:00 es el cierre a medianoche", () => {
    expect(parseTime("24:00")).toBe(1440);
    expect(formatTime(1440)).toBe("24:00");
  });
});