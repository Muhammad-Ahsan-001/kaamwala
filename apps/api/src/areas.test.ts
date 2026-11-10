import { describe, expect, it } from "vitest";
import { AREAS, findArea } from "./areas";

describe("findArea", () => {
  it.each([
    ["G-7", "G-7"],
    ["g 7", "G-7"],
    ["G-12", "G-12"],
    ["I-11", "I-11"],
    ["Faizabad", "Faizabad"],
    ["Tench Bhatta", "Tench Bhatta"],
    ["Murree Road", "Murree Road"],
    ["G-10/2", "G-10"],
  ])("knows %s", (text, name) => {
    expect(findArea(text)?.name).toBe(name);
  });

  it.each([
    ["Saddar Rawalpindi", "Saddar"],
    ["Satellite Town Rawalpindi", "Satellite Town"],
    ["صدر راولپنڈی", "Saddar"],
  ])("finds the area inside a longer name: %s", (text, name) => {
    expect(findArea(text)?.name).toBe(name);
  });

  it("places a real sector it does not list beside its nearest neighbour", () => {
    const area = findArea("G-16");
    expect(area?.name).toBe("G-16");
    const neighbour = AREAS.find((a) => a.name === "G-15");
    expect(area?.lat).toBe(neighbour?.lat);
    expect(area?.lng).toBe(neighbour?.lng);
  });

  it.each(["G-99", "G-1", "Clifton", "somewhere else", ""])("does not invent a place for %s", (text) => {
    expect(findArea(text)).toBeNull();
  });

  it("does not take a word ending in a sector letter for a sector", () => {
    expect(findArea("Phase 7")).toBeNull();
  });

  it("stays fast on hostile spacing", () => {
    const started = Date.now();
    findArea(`d${" ".repeat(200_000)}x`);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("keeps the areas seeded workers were placed in, in the same order", () => {
    expect(AREAS.slice(0, 4).map((a) => a.name)).toEqual(["G-6", "G-8", "G-9", "G-10"]);
    expect(AREAS[31]?.name).toBe("DHA Phase 2");
  });

  it("has no repeated names", () => {
    expect(new Set(AREAS.map((a) => a.name)).size).toBe(AREAS.length);
  });
});
