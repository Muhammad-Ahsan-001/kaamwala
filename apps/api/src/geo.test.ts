import { describe, expect, it } from "vitest";
import { distanceKm, endOfDayPkt, startOfDayPkt, startOfWeekPkt } from "./geo";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 33.7, lng: 73 }, { lat: 33.7, lng: 73 })).toBe(0);
  });

  it("measures G-9 to Saddar at about 11 km", () => {
    const d = distanceKm({ lat: 33.6885, lng: 73.0345 }, { lat: 33.5965, lng: 73.0485 });
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(12);
  });
});

describe("Pakistan time boundaries", () => {
  // 2026-11-10 20:30 UTC is 2026-11-11 01:30 in Pakistan, a Wednesday.
  const now = new Date("2026-11-10T20:30:00Z");

  it("starts the day at local midnight", () => {
    expect(startOfDayPkt(now).toISOString()).toBe("2026-11-10T19:00:00.000Z");
  });

  it("ends the day 24 hours later", () => {
    expect(endOfDayPkt(now).toISOString()).toBe("2026-11-11T19:00:00.000Z");
  });

  it("starts the week on Monday", () => {
    expect(startOfWeekPkt(now).toISOString()).toBe("2026-11-08T19:00:00.000Z");
  });
});
