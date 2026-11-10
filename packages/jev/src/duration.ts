import { readCount, wordSet } from "./language";
import { tokenize } from "./normalize";

const MAX_DAYS = 30;

const DAY_UNITS = wordSet(["din", "dino", "dinon", "dinoon", "day", "days", "دن", "دنوں"]);
const WEEK_UNITS = wordSet(["hafta", "hafte", "haftay", "haftey", "haftah", "week", "weeks", "ہفتہ", "ہفتے"]);
const MONTH_UNITS = wordSet(["mahina", "mahine", "mahinay", "maheena", "month", "months", "مہینہ", "مہینے"]);
const ENGLISH_UNITS = new Set(["day", "days", "week", "weeks", "month", "months"]);

/** "do din baad" says when the work happens, not how long it lasts. */
const NOT_A_DURATION = wordSet(["baad", "bad", "later", "after", "pehle", "ago", "se", "since", "بعد", "پہلے", "سے"]);
/** "pichle do din" and "for the last 3 days" look back, so they say how long it has been broken. */
const OPENS_A_DATE = wordSet([
  "after",
  "in",
  "since",
  "last",
  "past",
  "pichle",
  "pichhle",
  "pichla",
  "pichhla",
  "pichli",
  "pichhli",
  "پچھلے",
  "پچھلا",
  "پچھلی",
  "گزشتہ",
]);
const FILLERS = wordSet(["poore", "pure", "pooray", "full", "whole", "مکمل", "پورے"]);

const inRange = (days: number) => days >= 1 && days <= MAX_DAYS;

function daysPerUnit(token: string): number | null {
  if (DAY_UNITS.has(token)) return 1;
  if (WEEK_UNITS.has(token)) return 7;
  if (MONTH_UNITS.has(token)) return 30;
  return null;
}

function countBefore(tokens: string[], unitIndex: number): number | null {
  let i = unitIndex - 1;
  if (tokens[i] !== undefined && FILLERS.has(tokens[i] as string)) i--;
  const word = tokens[i];
  if (word === undefined || OPENS_A_DATE.has(tokens[i - 1] ?? "")) return null;
  if (word === "a" || word === "an") return 1;
  // In English "no days" means none. In Roman Urdu "no din" means nine days.
  if (word === "no" && ENGLISH_UNITS.has(tokens[unitIndex] as string)) return null;
  return readCount(word);
}

/**
 * Reads how many working days a job needs, from Urdu script, Roman Urdu or English.
 * Null when the text states no duration, or one outside 1 to 30 days.
 */
export function extractDurationDays(text: string): number | null {
  const tokens = tokenize(text);
  for (const [i, token] of tokens.entries()) {
    const joined = token.match(/^(\d{1,3})(?:din|days?)$/);
    if (joined) {
      const days = Number(joined[1]);
      const next = tokens[i + 1];
      const datePhrase = (next !== undefined && NOT_A_DURATION.has(next)) || OPENS_A_DATE.has(tokens[i - 1] ?? "");
      if (inRange(days) && !datePhrase) return days;
      continue;
    }

    const perUnit = daysPerUnit(token);
    if (perUnit === null) continue;
    const next = tokens[i + 1];
    if (next !== undefined && NOT_A_DURATION.has(next)) continue;
    const count = countBefore(tokens, i);
    if (count !== null && inRange(count * perUnit)) return count * perUnit;
  }
  return null;
}
