import { describe, expect, it } from "vitest";
import { buildSlots, checkBookableDate, dateIn, localToUtc, priceFor, weekdayOf } from "../src/modules/bookings/slots";

const BOGOTA = "America/Bogota";
const day = { weekdays: [1, 2, 3, 4, 5], startMin: 360, endMin: 1020, pricePerHour: 70_000 }; // 06:00-17:00
const night = { weekdays: [1, 2, 3, 4, 5], startMin: 1020, endMin: 1320, pricePerHour: 90_000 }; // 17:00-22:00
const hours = { opensMin: 360, closesMin: 1320 }; // 06:00-22:00
const THURSDAY = "2026-10-29";
const early = new Date("2026-10-01T00:00:00Z");

const slots = (o: Partial<Parameters<typeof buildSlots>[0]> = {}) =>
  buildSlots({ date: THURSDAY, timeZone: BOGOTA, hours, slotMinutes: 60, rules: [day, night], booked: [], now: early, ...o });
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

describe("zonas horarias", () => {
  it("Bogotá es UTC-5", () => {
    expect(localToUtc(THURSDAY, 19 * 60, BOGOTA).toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(localToUtc(THURSDAY, 0, BOGOTA).toISOString()).toBe("2026-10-29T05:00:00.000Z");
  });
  it("1440 minutos es la medianoche siguiente", () => {
    expect(localToUtc(THURSDAY, 1440, BOGOTA).toISOString()).toBe("2026-10-30T05:00:00.000Z");
  });
  it("respeta el horario de verano de otras zonas (Nueva York)", () => {
    expect(localToUtc("2026-03-07", 12 * 60, "America/New_York").toISOString()).toBe("2026-03-07T17:00:00.000Z"); // EST
    expect(localToUtc("2026-03-09", 12 * 60, "America/New_York").toISOString()).toBe("2026-03-09T16:00:00.000Z"); // EDT
  });
  it("la fecha local no es la de UTC: las 9 pm en Bogotá ya son el día siguiente en UTC", () => {
    expect(dateIn(BOGOTA, new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
  });
  it("calcula el día de la semana de una fecha de calendario", () => {
    expect(weekdayOf(THURSDAY)).toBe(4);
    expect(weekdayOf("2026-11-01")).toBe(0);
  });
});

describe("precio de un tramo", () => {
  it("usa la tarifa de la franja", () => {
    expect(priceFor([day, night], 4, 600, 660)).toBe(70_000);
    expect(priceFor([day, night], 4, 1140, 1200)).toBe(90_000);
  });
  it("un tramo que cruza dos franjas cobra cada minuto a su tarifa", () => {
    // 16:30 a 18:00: 30 min a 70.000 + 60 min a 90.000
    expect(priceFor([day, night], 4, 990, 1080)).toBe(125_000);
  });
  it("devuelve null si alguna parte no tiene tarifa o el día no tiene franjas", () => {
    expect(priceFor([day], 4, 1000, 1080)).toBeNull();
    expect(priceFor([day, night], 6, 600, 660)).toBeNull(); // sábado sin franjas
  });
  it("un turno de 30 minutos cuesta la mitad", () => {
    expect(priceFor([day, night], 4, 600, 630)).toBe(35_000);
  });
});

describe("turnos del día", () => {
  it("genera los 16 turnos de 06:00 a 22:00, con su tarifa", () => {
    const result = slots();
    expect(result).toHaveLength(16);
    expect(hhmm(result[0].startMin)).toBe("06:00");
    expect(result[0].price).toBe(70_000);
    expect(hhmm(result[15].startMin)).toBe("21:00");
    expect(result[15].price).toBe(90_000);
    expect(result.every((s) => s.available)).toBe(true);
  });
  it("con turnos de 90 minutos, el último termina a más tardar al cierre", () => {
    const result = slots({ slotMinutes: 90 });
    const last = result[result.length - 1];
    expect(last.endMin).toBeLessThanOrEqual(1320);
    expect(result.find((s) => s.startMin === 990)!.price).toBe(125_000); // el turno que cruza las 5 pm
  });
  it("no ofrece los turnos sin tarifa", () => {
    const result = slots({ rules: [day] });
    expect(result.at(-1)!.endMin).toBe(1020);
  });
  it("una reserva ocupa su turno y no toca los vecinos", () => {
    const booked = [{ startsAt: localToUtc(THURSDAY, 19 * 60, BOGOTA), endsAt: localToUtc(THURSDAY, 20 * 60, BOGOTA) }];
    const taken = slots({ booked }).filter((s) => !s.available).map((s) => hhmm(s.startMin));
    expect(taken).toEqual(["19:00"]);
  });
  it("una reserva que cruza dos turnos ocupa los dos", () => {
    const booked = [{ startsAt: localToUtc(THURSDAY, 19 * 60 + 30, BOGOTA), endsAt: localToUtc(THURSDAY, 20 * 60 + 30, BOGOTA) }];
    const taken = slots({ booked }).filter((s) => !s.available).map((s) => hhmm(s.startMin));
    expect(taken).toEqual(["19:00", "20:00"]);
  });
  it("no ofrece los turnos que ya empezaron", () => {
    const now = localToUtc(THURSDAY, 19 * 60 + 30, BOGOTA);
    expect(hhmm(slots({ now })[0].startMin)).toBe("20:00");
    // un turno que empieza justo ahora tampoco se ofrece
    expect(slots({ now: localToUtc(THURSDAY, 20 * 60, BOGOTA) })[0].startMin).toBe(21 * 60);
  });
  it("cerrar a medianoche: el último turno termina a las 00:00 locales del día siguiente", () => {
    const result = slots({ hours: { opensMin: 1080, closesMin: 1440 }, rules: [{ ...night, startMin: 1020, endMin: 1440 }] });
    expect(result.at(-1)!.end.toISOString()).toBe("2026-10-30T05:00:00.000Z");
    expect(hhmm(result.at(-1)!.startMin)).toBe("23:00");
  });
});

describe("fecha reservable", () => {
  const now = new Date("2026-10-28T15:00:00Z"); // 10:00 am del 28 en Bogotá
  it("acepta hoy, mañana y hasta el límite", () => {
    expect(checkBookableDate("2026-10-28", BOGOTA, 30, now)).toBeNull();
    expect(checkBookableDate("2026-11-27", BOGOTA, 30, now)).toBeNull();
  });
  it("rechaza ayer, más allá del límite y fechas inexistentes", () => {
    expect(checkBookableDate("2026-10-27", BOGOTA, 30, now)).toMatch(/pasó/);
    expect(checkBookableDate("2026-11-28", BOGOTA, 30, now)).toMatch(/anticipación/);
    expect(checkBookableDate("2026-02-30", BOGOTA, 30, now)).toBe("Fecha inválida");
    expect(checkBookableDate("hoy", BOGOTA, 30, now)).toBe("Fecha inválida");
  });
  it("usa la fecha de Bogotá, no la de UTC: a las 9 pm del 28 en Bogotá ya es el 29 en UTC", () => {
    const night9pm = new Date("2026-10-29T02:00:00Z");
    expect(checkBookableDate("2026-10-28", BOGOTA, 30, night9pm)).toBeNull();
  });
});