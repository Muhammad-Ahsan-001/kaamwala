import { describe, expect, it } from "vitest";
import { toDateOnly } from "../geo";
import { bookedTime, dayDates, isValidStartDate, jobFacts } from "./days";

// 20:30 UTC on 10 Nov is already 01:30 on 11 Nov in Pakistan.
const now = new Date("2026-11-10T20:30:00Z");

describe("isValidStartDate", () => {
  it("uses Pakistan's date for today", () => {
    expect(isValidStartDate("2026-11-11", now)).toBe(true);
    expect(isValidStartDate("2026-11-10", now)).toBe(false);
  });

  it("allows up to 14 days ahead", () => {
    expect(isValidStartDate("2026-11-25", now)).toBe(true);
    expect(isValidStartDate("2026-11-26", now)).toBe(false);
  });

  it("rejects dates that do not exist or are badly written", () => {
    expect(isValidStartDate("2026-11-31", now)).toBe(false);
    expect(isValidStartDate("11/12/2026", now)).toBe(false);
    expect(isValidStartDate("2026-11-12T10:00:00Z", now)).toBe(false);
  });
});

describe("dayDates", () => {
  it("runs consecutively across a month end", () => {
    expect(dayDates("2026-11-29", 3)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});

describe("jobFacts", () => {
  it("states days, range, rate and total", () => {
    expect(jobFacts({ durationDays: 3, startDate: toDateOnly("2026-11-12"), proposedPrice: 900, agreedPrice: 1000 })).toBe(
      "3 working day(s), from 2026-11-12 to 2026-11-14, Rs 1000 per day, Rs 3000 in total",
    );
  });

  it("does not invent a price", () => {
    expect(jobFacts({ durationDays: 1, startDate: toDateOnly("2026-11-12"), proposedPrice: null, agreedPrice: null })).toContain(
      "price not agreed yet",
    );
  });
});

describe("bookedTime", () => {
  const slot = () => "SLOT";

  it("gives the range for several days", () => {
    expect(bookedTime({ durationDays: 2, startDate: toDateOnly("2026-11-12"), scheduledFor: null }, slot, now)).toBe(
      "2 din: 2026-11-12 se 2026-11-13",
    );
  });

  it("gives the slot for one day", () => {
    expect(bookedTime({ durationDays: 1, startDate: toDateOnly("2026-11-11"), scheduledFor: now }, slot, now)).toBe("SLOT");
  });

  it("gives a future start date", () => {
    expect(bookedTime({ durationDays: 1, startDate: toDateOnly("2026-11-15"), scheduledFor: null }, slot, now)).toBe("2026-11-15");
  });

  it("has nothing to state for a one-day job today", () => {
    expect(bookedTime({ durationDays: 1, startDate: toDateOnly("2026-11-11"), scheduledFor: null }, slot, now)).toBeNull();
  });
});
