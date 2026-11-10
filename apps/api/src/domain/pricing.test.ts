import { describe, expect, it } from "vitest";
import { movePrice, splitAgentFee, splitEarnings } from "./pricing";

describe("splitAgentFee", () => {
  it("applies the default 40% share of Rs 200", () => {
    expect(splitAgentFee(200, 40)).toEqual({ agentShare: 80, platformShare: 120 });
  });

  it("rounds the agent share and keeps the sum exact", () => {
    expect(splitAgentFee(350, 33)).toEqual({ agentShare: 116, platformShare: 234 });
    expect(splitAgentFee(199, 50)).toEqual({ agentShare: 100, platformShare: 99 });
  });

  it("handles the ends of the range", () => {
    expect(splitAgentFee(200, 0)).toEqual({ agentShare: 0, platformShare: 200 });
    expect(splitAgentFee(200, 100)).toEqual({ agentShare: 200, platformShare: 0 });
    expect(splitAgentFee(0, 40)).toEqual({ agentShare: 0, platformShare: 0 });
  });
});

describe("movePrice", () => {
  it("moves by exactly one step", () => {
    expect(movePrice(1000, "up", 50, 500)).toBe(1050);
    expect(movePrice(1000, "down", 50, 500)).toBe(950);
  });

  it("allows landing exactly on the floor", () => {
    expect(movePrice(550, "down", 50, 500)).toBe(500);
  });

  it("refuses to go below the floor", () => {
    expect(movePrice(500, "down", 50, 500)).toBeNull();
    expect(movePrice(520, "down", 50, 500)).toBeNull();
  });
});

describe("splitEarnings", () => {
  it("keeps the whole amount for one worker", () => {
    expect(splitEarnings(1500, 1)).toEqual([1500]);
  });

  it("gives any remainder to the leader and always sums to the total", () => {
    const shares = splitEarnings(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
