import { addDaysIso, fromDateOnly, todayPkt, toDateOnly } from "../geo";

export const MAX_DURATION_DAYS = 30;
export const MAX_START_DAYS_AHEAD = 14;

/** Accepts only a real calendar date, from today up to 14 days ahead in Pakistan. */
export function isValidStartDate(iso: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const parsed = toDateOnly(iso);
  if (Number.isNaN(parsed.getTime()) || fromDateOnly(parsed) !== iso) return false;
  const today = todayPkt(now);
  return iso >= today && iso <= addDaysIso(today, MAX_START_DAYS_AHEAD);
}

/** Consecutive calendar days, starting on the start date. */
export function dayDates(startIso: string, durationDays: number): string[] {
  return Array.from({ length: durationDays }, (_, i) => addDaysIso(startIso, i));
}

export interface JobSchedule {
  durationDays: number;
  startDate: Date;
  proposedPrice: number | null;
  agreedPrice: number | null;
}

/** The days, dates, per-day rate and total, as database facts for an AI prompt. */
export function jobFacts(job: JobSchedule): string {
  const start = fromDateOnly(job.startDate);
  const end = addDaysIso(start, job.durationDays - 1);
  const perDay = job.agreedPrice ?? job.proposedPrice;
  const price = perDay === null ? "price not agreed yet" : `Rs ${perDay} per day, Rs ${perDay * job.durationDays} in total`;
  return `${job.durationDays} working day(s), from ${start} to ${end}, ${price}`;
}

/** When the work happens, read from the booking. Null for a one-day job with no date to state. */
export function bookedTime(
  job: { durationDays: number; startDate: Date; scheduledFor: Date | null },
  formatSlot: (d: Date) => string,
  now: Date = new Date(),
): string | null {
  const start = fromDateOnly(job.startDate);
  if (job.durationDays > 1) return `${job.durationDays} din: ${start} se ${addDaysIso(start, job.durationDays - 1)}`;
  if (job.scheduledFor) return formatSlot(job.scheduledFor);
  return start > todayPkt(now) ? start : null;
}
