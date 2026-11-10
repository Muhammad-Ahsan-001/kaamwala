const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pakistan has one fixed offset and no daylight saving. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function startOfDayPkt(now: Date): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - PKT_OFFSET_MS);
}

export function endOfDayPkt(now: Date): Date {
  return new Date(startOfDayPkt(now).getTime() + 24 * 60 * 60 * 1000);
}

/** Today's calendar date in Pakistan, as YYYY-MM-DD. */
export function todayPkt(now: Date = new Date()): string {
  return new Date(now.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar dates are stored at UTC midnight in DATE columns. */
export const toDateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const fromDateOnly = (date: Date) => date.toISOString().slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  return fromDateOnly(new Date(toDateOnly(iso).getTime() + days * 24 * 60 * 60 * 1000));
}

/** The moment a calendar date in Pakistan ends. */
export function endOfDatePkt(iso: string): Date {
  return new Date(toDateOnly(iso).getTime() + 24 * 60 * 60 * 1000 - PKT_OFFSET_MS);
}

/** The moment a calendar date in Pakistan begins. */
export function startOfDatePkt(iso: string): Date {
  return new Date(toDateOnly(iso).getTime() - PKT_OFFSET_MS);
}

/** Monday 00:00 in Pakistan time. */
export function startOfWeekPkt(now: Date): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(startOfDayPkt(now).getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}
