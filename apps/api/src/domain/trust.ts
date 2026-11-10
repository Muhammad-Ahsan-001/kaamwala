import { addDaysIso, endOfDatePkt, fromDateOnly, startOfDatePkt } from "../geo";

/** How long after the agreed time a one-day job may finish and still count as on time. */
export const ON_TIME_ALLOWANCE_MS = 4 * 60 * 60 * 1000;

export interface TimedJob {
  scheduledFor: Date | null;
  engagedAt: Date | null;
  completedAt: Date | null;
  startDate: Date;
  durationDays: number;
}

export interface AcceptedOffer {
  acceptedAt: Date | null;
  etaMinutes: number | null;
}

/** Null when the job has no timestamps to judge it by. */
export function wasOnTime(job: TimedJob, offer?: AcceptedOffer | null): boolean | null {
  if (!job.completedAt) return null;
  const finished = job.completedAt.getTime();
  const start = fromDateOnly(job.startDate);
  const lastDayEnds = endOfDatePkt(addDaysIso(start, job.durationDays - 1)).getTime();

  // A job over several days is on time if it ends by the close of its last booked day.
  if (job.durationDays > 1) return finished <= lastDayEnds;

  if (job.scheduledFor) return finished <= job.scheduledFor.getTime() + ON_TIME_ALLOWANCE_MS;

  // Booked ahead for a later date: confirmation time says nothing about punctuality.
  if (job.engagedAt && job.engagedAt < startOfDatePkt(start)) return finished <= lastDayEnds;

  // The agreed time is the accepted offer's ETA, otherwise when the booking was confirmed.
  const promised =
    offer?.acceptedAt && offer.etaMinutes !== null
      ? new Date(offer.acceptedAt.getTime() + offer.etaMinutes * 60_000)
      : job.engagedAt;
  if (!promised) return null;
  return finished <= promised.getTime() + ON_TIME_ALLOWANCE_MS;
}

export function onTimeRate(results: (boolean | null)[]): number {
  const judged = results.filter((r): r is boolean => r !== null);
  return judged.length ? Math.round((judged.filter(Boolean).length / judged.length) * 100) / 100 : 0;
}

/** Average of (reply time minus posted time), in minutes to one decimal. */
export function averageResponseMinutes(pairs: { postedAt: Date; repliedAt: Date }[]): number | null {
  if (!pairs.length) return null;
  const totalMs = pairs.reduce((sum, p) => sum + Math.max(0, p.repliedAt.getTime() - p.postedAt.getTime()), 0);
  return Math.round((totalMs / pairs.length / 60_000) * 10) / 10;
}
