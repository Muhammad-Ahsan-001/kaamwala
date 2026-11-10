import { createHash } from "node:crypto";

export interface ReviewReading {
  transcript: string;
  rating: number | null;
  tags: string[];
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

const readings = new Map<string, { value: ReviewReading; at: number }>();

export const readingKey = (jobId: string, direction: string, audio: Buffer) =>
  createHash("sha256").update(jobId).update(direction).update(audio).digest("hex");

/**
 * What Gemini made of this recording when the reviewer asked to see it first. Submitting the same
 * recording uses this reading, so one review never costs two model calls.
 */
export function rememberReading(key: string, value: ReviewReading, now: number = Date.now()): void {
  for (const [k, entry] of readings) {
    if (now - entry.at >= TTL_MS) readings.delete(k);
  }
  if (readings.size >= MAX_ENTRIES) readings.delete(readings.keys().next().value as string);
  readings.set(key, { value, at: now });
}

export function recallReading(key: string, now: number = Date.now()): ReviewReading | null {
  const entry = readings.get(key);
  if (!entry || now - entry.at >= TTL_MS) return null;
  return entry.value;
}

export function clearReadings(): void {
  readings.clear();
}
