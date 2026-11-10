import type { Lang } from "./settings";

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export const today = () => isoDate(new Date());
export const MAX_START_AHEAD = 14;
export const MIN_DAYS = 1;
export const MAX_DAYS = 30;

export function dateLabel(iso: string, lang: Lang) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString(lang === "ur" ? "ur-PK" : "en-GB", { day: "numeric", month: "short" });
}

export function rangeLabel(startDate: string, days: number, lang: Lang) {
  const first = dateLabel(startDate, lang);
  return days <= 1 ? first : `${first} – ${dateLabel(addDays(startDate.slice(0, 10), days - 1), lang)}`;
}

export function clockLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });
}
