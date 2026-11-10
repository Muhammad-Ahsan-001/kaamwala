import { describe, expect, it } from "vitest";
import { toDateOnly } from "../geo";
import { averageResponseMinutes, onTimeRate, wasOnTime } from "./trust";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 1, hour, minute));
const oneDay = { startDate: toDateOnly("2026-11-01"), durationDays: 1 };

describe("wasOnTime", () => {
  it("judges against the booked slot first", () => {
    const job = { ...oneDay, scheduledFor: at(10), engagedAt: at(8), completedAt: at(13) };
    expect(wasOnTime(job)).toBe(true);
    expect(wasOnTime({ ...job, completedAt: at(15) })).toBe(false);
  });

  it("counts exactly the end of the allowance as on time", () => {
    expect(wasOnTime({ ...oneDay, scheduledFor: at(10), engagedAt: at(8), completedAt: at(14) })).toBe(true);
  });

  it("uses the accepted offer's ETA when there is no slot", () => {
    const job = { ...oneDay, scheduledFor: null, engagedAt: at(9), completedAt: at(15) };
    expect(wasOnTime(job, { acceptedAt: at(9), etaMinutes: 120 })).toBe(true);
    expect(wasOnTime(job, { acceptedAt: at(9), etaMinutes: 60 })).toBe(false);
  });

  it("falls back to the confirmation time", () => {
    expect(wasOnTime({ ...oneDay, scheduledFor: null, engagedAt: at(9), completedAt: at(12) })).toBe(true);
    expect(wasOnTime({ ...oneDay, scheduledFor: null, engagedAt: at(9), completedAt: at(14) })).toBe(false);
  });

  it("returns null when the job cannot be judged", () => {
    expect(wasOnTime({ ...oneDay, scheduledFor: null, engagedAt: null, completedAt: at(9) })).toBeNull();
    expect(wasOnTime({ ...oneDay, scheduledFor: at(9), engagedAt: at(8), completedAt: null })).toBeNull();
  });

  it("judges a multi-day job by the close of its last day", () => {
    const job = {
      startDate: toDateOnly("2026-11-01"),
      durationDays: 3,
      scheduledFor: null,
      engagedAt: new Date("2026-10-31T09:00:00Z"),
    };
    expect(wasOnTime({ ...job, completedAt: new Date("2026-11-03T18:59:00Z") })).toBe(true);
    expect(wasOnTime({ ...job, completedAt: new Date("2026-11-03T19:01:00Z") })).toBe(false);
  });

  it("does not punish a one-day job booked ahead", () => {
    const job = {
      startDate: toDateOnly("2026-11-05"),
      durationDays: 1,
      scheduledFor: null,
      engagedAt: new Date("2026-11-01T09:00:00Z"),
    };
    expect(wasOnTime({ ...job, completedAt: new Date("2026-11-05T12:00:00Z") })).toBe(true);
    expect(wasOnTime({ ...job, completedAt: new Date("2026-11-06T12:00:00Z") })).toBe(false);
  });
});

describe("onTimeRate", () => {
  it("ignores jobs that cannot be judged", () => {
    expect(onTimeRate([true, true, false, null])).toBe(0.67);
  });

  it("is zero with nothing to judge", () => {
    expect(onTimeRate([])).toBe(0);
    expect(onTimeRate([null])).toBe(0);
  });
});

describe("averageResponseMinutes", () => {
  it("is null with no replies", () => {
    expect(averageResponseMinutes([])).toBeNull();
  });

  it("averages to one decimal", () => {
    expect(
      averageResponseMinutes([
        { postedAt: at(9), repliedAt: at(9, 10) },
        { postedAt: at(9), repliedAt: at(9, 5) },
      ]),
    ).toBe(7.5);
  });
});
