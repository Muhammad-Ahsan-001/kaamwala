import { describe, expect, it } from "vitest";
import { FeedCategoryIds, feedTrades, mayBidOnTrade } from "./feedTrades";

const worker = (...feedCategoryIds: string[]) => ({ categoryIds: ["plumber"], feedCategoryIds });

describe("feedTrades", () => {
  it("keeps a worker who chose nothing on their own trades", () => {
    expect(feedTrades(worker())).toEqual(["plumber"]);
  });

  it("uses exactly what the worker chose once they have chosen", () => {
    expect(feedTrades(worker("electrician", "painter"))).toEqual(["electrician", "painter"]);
  });
});

describe("mayBidOnTrade", () => {
  it("allows the worker's own trade when nothing is chosen", () => {
    expect(mayBidOnTrade(worker(), "plumber")).toBe(true);
    expect(mayBidOnTrade(worker(), "electrician")).toBe(false);
  });

  it("allows a chosen trade outside the worker's own", () => {
    expect(mayBidOnTrade(worker("electrician"), "electrician")).toBe(true);
  });

  it("still allows their own trade when they left it out of the feed", () => {
    expect(mayBidOnTrade(worker("electrician"), "plumber")).toBe(true);
  });

  it("refuses anything outside what they chose plus their own trades", () => {
    expect(mayBidOnTrade(worker("electrician"), "painter")).toBe(false);
  });
});

describe("FeedCategoryIds", () => {
  it("accepts a list of ids", () => {
    expect(FeedCategoryIds.parse(["plumber", "electrician"])).toEqual(["plumber", "electrician"]);
  });

  it("refuses an empty list", () => {
    expect(FeedCategoryIds.safeParse([]).success).toBe(false);
  });

  it("refuses anything that is not a list of ids", () => {
    expect(FeedCategoryIds.safeParse("plumber").success).toBe(false);
    expect(FeedCategoryIds.safeParse([1]).success).toBe(false);
    expect(FeedCategoryIds.safeParse(["  "]).success).toBe(false);
  });
});
