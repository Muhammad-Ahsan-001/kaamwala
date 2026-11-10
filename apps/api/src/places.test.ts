import { afterEach, describe, expect, it, vi } from "vitest";
import { findPlace, isGenericPlace, nearestListed, placeNear, resolvePlace } from "./places";

const G9 = { lat: 33.6885, lng: 73.0345 };
const FAR_OUT = { lat: 33.8, lng: 73.3 };

const answer = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe("isGenericPlace", () => {
  it.each(["Islamabad", "islamabad pakistan", "Rawalpindi", "پنڈی", "اسلام آباد", "راولپنڈی شہر"])("%s names only a city", (text) => {
    expect(isGenericPlace(text)).toBe(true);
  });
  it.each(["G-9", "Ghauri Town", "Saddar Rawalpindi"])("%s names a real place", (text) => {
    expect(isGenericPlace(text)).toBe(false);
  });
});

describe("placeNear", () => {
  it("uses a listed area when the point is close to one, with no map lookup", async () => {
    const fetchMock = answer({});
    vi.stubGlobal("fetch", fetchMock);
    await expect(placeNear(G9)).resolves.toBe("G-9");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the map's own name further out", async () => {
    vi.stubGlobal("fetch", answer({ address: { suburb: "Tarlai Kalan", city: "Islamabad" } }));
    await expect(placeNear(FAR_OUT)).resolves.toBe("Tarlai Kalan");
  });

  it("never settles for a city name, and falls back to the nearest listed area", async () => {
    vi.stubGlobal("fetch", answer({ address: { town: "Islamabad" } }));
    await expect(placeNear({ lat: 33.81, lng: 73.31 })).resolves.toBe(nearestListed({ lat: 33.81, lng: 73.31 }).name);
  });
});

describe("findPlace", () => {
  it("does not treat a whole city as a place", async () => {
    const fetchMock = answer([{ lat: "33.7", lon: "73.1" }]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(findPlace("Islamabad")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a place that is not on the list, only within the twin cities", async () => {
    const fetchMock = answer([{ lat: "33.56", lon: "73.15" }]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(findPlace("Ghauri Town Phase 4")).resolves.toEqual({ name: "Ghauri Town Phase 4", lat: 33.56, lng: 73.15, listed: false });
    const url = String(fetchMock.mock.calls[0 as number]?.[0 as never] ?? "");
    expect(url).toContain("bounded=1");
  });
});

describe("resolvePlace", () => {
  it("replaces a vague word with the real nearby place when GPS is given", async () => {
    await expect(resolvePlace("Islamabad", G9)).resolves.toEqual({ area: "G-9", ...G9 });
  });

  it("keeps a specific spoken place but uses the exact location", async () => {
    const exact = { lat: 33.6, lng: 73.05 };
    await expect(resolvePlace("Saddar", exact)).resolves.toEqual({ area: "Saddar", ...exact });
  });

  it("names the place when nothing was said but GPS was shared", async () => {
    await expect(resolvePlace("", G9)).resolves.toEqual({ area: "G-9", ...G9 });
  });

  it("refuses a vague word with no location", async () => {
    await expect(resolvePlace("اسلام آباد")).resolves.toBeNull();
  });
});
