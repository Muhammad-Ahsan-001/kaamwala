import { afterEach, describe, expect, it } from "vitest";
import { clearReadings, readingKey, recallReading, rememberReading } from "./reviewDrafts";

const reading = { transcript: "acha kaam", rating: 5, tags: ["saaf kaam"] };
const audio = Buffer.from([1, 2, 3]);

afterEach(clearReadings);

describe("review readings", () => {
  it("returns what was remembered for the same recording", () => {
    const key = readingKey("job", "customer_to_worker", audio);
    rememberReading(key, reading);
    expect(recallReading(readingKey("job", "customer_to_worker", Buffer.from([1, 2, 3])))).toEqual(reading);
  });

  it("keeps recordings, jobs and directions apart", () => {
    rememberReading(readingKey("job", "customer_to_worker", audio), reading);
    expect(recallReading(readingKey("job", "customer_to_worker", Buffer.from([9])))).toBeNull();
    expect(recallReading(readingKey("other", "customer_to_worker", audio))).toBeNull();
    expect(recallReading(readingKey("job", "worker_to_customer", audio))).toBeNull();
  });

  it("forgets after half an hour", () => {
    const key = readingKey("job", "customer_to_worker", audio);
    rememberReading(key, reading, 1_000);
    expect(recallReading(key, 1_000 + 29 * 60_000)).toEqual(reading);
    expect(recallReading(key, 1_000 + 30 * 60_000)).toBeNull();
  });

  it("stays bounded", () => {
    for (let i = 0; i < 250; i++) rememberReading(`k${i}`, reading, 1_000);
    expect(recallReading("k0", 2_000)).toBeNull();
    expect(recallReading("k249", 2_000)).toEqual(reading);
  });
});
