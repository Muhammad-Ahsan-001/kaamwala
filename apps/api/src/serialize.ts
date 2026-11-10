import type {
  AuthUser,
  Category as CategoryDto,
  Crew as CrewDto,
  Earning as EarningDto,
  HirerCard,
  Job as JobDto,
  JobCardData,
  Message as MessageDto,
  Offer as OfferDto,
  PastWork,
  Review as ReviewDto,
  ReviewView,
  TrustSummary,
  WorkerCard,
} from "@kaamwala/contracts";
import { canonicalText } from "@kaamwala/jev";
import type { Category, Earning, Message, Prisma, Review, User, WorkerProfile } from "@prisma/client";
import { prisma } from "./db";
import { averageResponseMinutes, hirerPaymentStats, onTimeRate, wasOnTime } from "./domain/trust";
import { distanceKm, fromDateOnly } from "./geo";
import { signedAudioUrl } from "./uploads";

export const oneDecimal = (n: number) => Math.round(n * 10) / 10;

const firstNameOf = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export const toCategory = (c: Category): CategoryDto => ({
  id: c.id,
  nameUr: c.nameUr,
  nameRoman: c.nameRoman,
  nameEn: c.nameEn,
  icon: c.icon,
  keywords: c.keywords,
  skills: c.skills,
  skillAliases: (c.skillAliases ?? {}) as Record<string, string[]>,
  floorPrice: c.floorPrice,
  step: c.step,
  crewAllowed: c.crewAllowed,
  active: c.active,
  sortOrder: c.sortOrder,
});

/** Counts tags, treating different spellings of one tag as the same tag. */
function tallyTags(tagLists: string[][]): { tag: string; count: number }[] {
  const tally = new Map<string, { tag: string; count: number }>();
  for (const tags of tagLists) {
    for (const tag of tags) {
      const key = canonicalText(tag);
      if (!key) continue;
      const entry = tally.get(key) ?? { tag: tag.trim(), count: 0 };
      entry.count += 1;
      tally.set(key, entry);
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count);
}

export type WorkerWithUser = WorkerProfile & { user: User };

/** Trust is always computed from real completed jobs and reviews. */
export async function trustFor(workers: WorkerProfile[]): Promise<Map<string, TrustSummary>> {
  const workerIds = workers.map((w) => w.id);
  const [rows, answered, offers] = await Promise.all([
    prisma.jobAssignment.findMany({
      where: { workerId: { in: workerIds }, job: { status: "completed" } },
      select: {
        workerId: true,
        job: {
          select: {
            categoryId: true,
            scheduledFor: true,
            engagedAt: true,
            completedAt: true,
            startDate: true,
            durationDays: true,
            reviews: { where: { direction: "customer_to_worker" }, select: { rating: true, tags: true } },
            offers: { where: { status: "accepted" }, select: { acceptedAt: true, etaMinutes: true }, take: 1 },
          },
        },
      },
    }),
    prisma.jobAssignment.findMany({
      where: { workerId: { in: workerIds }, respondedAt: { not: null } },
      select: { workerId: true, respondedAt: true, job: { select: { createdAt: true } } },
    }),
    prisma.offer.findMany({
      where: { workerId: { in: workerIds } },
      select: { workerId: true, createdAt: true, job: { select: { createdAt: true } } },
    }),
  ]);

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.workerId) ?? [];
    list.push(row);
    grouped.set(row.workerId, list);
  }

  const replies = new Map<string, { postedAt: Date; repliedAt: Date }[]>();
  const addReply = (workerId: string, postedAt: Date, repliedAt: Date) => {
    const list = replies.get(workerId) ?? [];
    list.push({ postedAt, repliedAt });
    replies.set(workerId, list);
  };
  for (const a of answered) addReply(a.workerId, a.job.createdAt, a.respondedAt as Date);
  for (const o of offers) addReply(o.workerId, o.job.createdAt, o.createdAt);

  return new Map(
    workers.map((w) => {
      const jobs = grouped.get(w.id) ?? [];
      const reviews = jobs.flatMap((j) => j.job.reviews);
      const types = new Map<string, number>();
      for (const j of jobs) types.set(j.job.categoryId, (types.get(j.job.categoryId) ?? 0) + 1);
      const summary: TrustSummary = {
        jobCount: jobs.length,
        rating: reviews.length ? oneDecimal(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0,
        ratingCount: reviews.length,
        responseRate: w.requestsReceived ? Math.min(1, w.requestsAnswered / w.requestsReceived) : 1,
        tags: tallyTags(reviews.map((r) => r.tags)),
        jobTypes: [...types].map(([categoryId, count]) => ({ categoryId, count })),
        onTimeRate: onTimeRate(jobs.map((j) => wasOnTime(j.job, j.job.offers[0]))),
        avgResponseMinutes: averageResponseMinutes(replies.get(w.id) ?? []),
      };
      return [w.id, summary] as const;
    }),
  );
}

export function toWorkerCard(
  w: WorkerWithUser,
  trust: TrustSummary,
  cnicDuplicateChecked: boolean,
  origin?: { lat: number; lng: number },
): WorkerCard {
  return {
    id: w.id,
    userId: w.userId,
    name: w.user.name ?? "",
    photoUrl: w.photoUrl,
    categoryIds: w.categoryIds,
    skills: w.skills,
    years: w.years,
    rate: w.rate,
    area: w.area,
    location: { lat: w.lat, lng: w.lng },
    status: w.status,
    offlineUntil: w.offlineUntil?.toISOString() ?? null,
    approved: w.approved,
    trust,
    cnicDuplicateChecked,
    phoneChecked: w.user.phoneVerifiedAt !== null,
    workingHours: w.workingHours,
    photos: w.photos,
    ...(origin ? { distanceKm: oneDecimal(distanceKm(origin, { lat: w.lat, lng: w.lng })) } : {}),
  };
}

export async function workerCards(workers: WorkerWithUser[], origin?: { lat: number; lng: number }): Promise<WorkerCard[]> {
  const [trust, hashes] = await Promise.all([
    trustFor(workers),
    prisma.cnicHash.findMany({ where: { workerId: { in: workers.map((w) => w.id) } }, select: { workerId: true } }),
  ]);
  const withCnic = new Set(hashes.map((h) => h.workerId));
  return workers.map((w) => toWorkerCard(w, trust.get(w.id) as TrustSummary, withCnic.has(w.id), origin));
}

export async function workerCard(id: string): Promise<WorkerCard | null> {
  const row = await prisma.workerProfile.findUnique({ where: { id }, include: { user: true } });
  if (!row) return null;
  const [card] = await workerCards([row]);
  return card ?? null;
}

/** Every past-work photo. Only a label Gemini actually gave is shown, never a guess. */
export function toPastWork(w: { photos: string[]; photoSkills: Prisma.JsonValue }): PastWork[] {
  const labels = (w.photoSkills ?? {}) as Record<string, string>;
  return w.photos.map((url) => ({ id: url.split("/").pop() ?? url, url, skill: labels[url] ?? null }));
}

/** Exact location and address go only to the customer themselves. */
export async function hirerCard(userId: string, options: { own?: boolean } = {}): Promise<HirerCard | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { hirerProfile: true } });
  if (!user) return null;
  const [jobCount, jobTypes, reviews] = await Promise.all([
    prisma.job.count({ where: { customerId: userId, status: "completed" } }),
    prisma.job.groupBy({ by: ["categoryId"], where: { customerId: userId, status: "completed" }, _count: { _all: true } }),
    prisma.review.findMany({
      where: { revieweeId: userId, direction: "worker_to_customer" },
      select: { rating: true, tags: true },
    }),
  ]);
  const profile = user.hirerProfile;
  const own = options.own === true;
  const tagLists = reviews.map((r) => r.tags);
  return {
    id: user.id,
    name: user.name ?? "",
    photoUrl: profile?.photoUrl ?? null,
    area: profile?.area ?? null,
    jobCount,
    rating: reviews.length ? oneDecimal(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0,
    ratingCount: reviews.length,
    tags: tallyTags(tagLists),
    jobTypes: jobTypes.map((t) => ({ categoryId: t.categoryId, count: t._count._all })),
    ...hirerPaymentStats(tagLists),
    location: own && profile?.lat != null && profile.lng != null ? { lat: profile.lat, lng: profile.lng } : null,
    address: own ? (profile?.address ?? null) : null,
  };
}

export const jobInclude = {
  customer: { select: { name: true, hirerProfile: { select: { address: true } } } },
  assignments: { select: { workerId: true, active: true } },
  crew: { select: { leaderId: true } },
  days: { orderBy: { dayNumber: "asc" } },
} satisfies Prisma.JobInclude;

export type JobFull = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

export const toJob = (j: JobFull): JobDto => ({
  id: j.id,
  mode: j.mode,
  status: j.status,
  customerId: j.customerId,
  customerName: j.customer.name ?? "",
  categoryId: j.categoryId,
  description: j.description,
  urgency: j.urgency,
  area: j.area,
  location: { lat: j.lat, lng: j.lng },
  scheduledFor: j.scheduledFor?.toISOString() ?? null,
  photoUrls: j.photoUrls,
  floor: j.floor,
  step: j.step,
  proposedPrice: j.proposedPrice,
  proposedBy: j.proposedById,
  agreedPrice: j.agreedPrice,
  workerIds: j.assignments.map((a) => a.workerId),
  crewId: j.crewId,
  card: (j.card ?? null) as JobCardData | null,
  customerConfirmed: j.customerConfirmed,
  workerConfirmed: j.workerConfirmed,
  createdAt: j.createdAt.toISOString(),
  completedAt: j.completedAt?.toISOString() ?? null,
  durationDays: j.durationDays,
  startDate: fromDateOnly(j.startDate),
  totalPrice: j.totalPrice,
  days: j.days.map((d) => ({
    dayNumber: d.dayNumber,
    date: fromDateOnly(d.date),
    status: d.status,
    completedAt: d.completedAt?.toISOString() ?? null,
  })),
  // The worker needs the address only once the booking is real.
  address: j.engagedAt ? (j.customer.hirerProfile?.address ?? null) : null,
});

const AREA_PRECISION = 100;
export const toArea = (n: number) => Math.round(n * AREA_PRECISION) / AREA_PRECISION;

/**
 * What a worker who is not on the job sees of an open job: enough to decide whether to bid.
 * The customer's full name and exact location stay private until an offer is accepted.
 */
export const toOpenJobView = (j: JobFull): JobDto => ({
  ...toJob(j),
  customerName: firstNameOf(j.customer.name),
  location: { lat: toArea(j.lat), lng: toArea(j.lng) },
  address: null,
});

export const toMessage = (m: Message): MessageDto => ({
  id: m.id,
  jobId: m.jobId,
  senderId: m.senderId,
  audioUrl: signedAudioUrl(m.audioUrl),
  transcript: m.transcript,
  text: m.text,
  createdAt: m.createdAt.toISOString(),
});

export const toReview = (r: Review): ReviewDto => ({
  id: r.id,
  jobId: r.jobId,
  direction: r.direction,
  rating: r.rating,
  audioUrl: signedAudioUrl(r.audioUrl),
  transcript: r.transcript,
  tags: r.tags,
  createdAt: r.createdAt.toISOString(),
});

export const reviewInclude = {
  reviewer: {
    select: {
      name: true,
      hirerProfile: { select: { area: true } },
      workerProfile: { select: { area: true } },
    },
  },
  job: { select: { categoryId: true } },
} satisfies Prisma.ReviewInclude;
type ReviewFull = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

/** Profiles are public, so a reviewer appears by first name and area only. */
export const toReviewView = (r: ReviewFull): ReviewView => ({
  ...toReview(r),
  authorName: firstNameOf(r.reviewer.name),
  authorArea: r.reviewer.hirerProfile?.area ?? r.reviewer.workerProfile?.area ?? null,
  categoryId: r.job.categoryId,
});

export const toEarning = (e: Earning): EarningDto => ({
  id: e.id,
  jobId: e.jobId,
  amount: e.amount,
  categoryId: e.categoryId,
  earnedAt: e.earnedAt.toISOString(),
  dayNumber: e.dayNumber,
});

export const offerInclude = { worker: { include: { user: true } } } satisfies Prisma.OfferInclude;
type OfferFull = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

/** origin fills in each bidder's distance from the job. */
export async function toOffers(offers: OfferFull[], origin?: { lat: number; lng: number }): Promise<OfferDto[]> {
  const cards = new Map((await workerCards(offers.map((o) => o.worker), origin)).map((c) => [c.id, c]));
  return offers.map((o) => ({
    id: o.id,
    jobId: o.jobId,
    worker: cards.get(o.workerId) as WorkerCard,
    crewId: o.crewId,
    price: o.price,
    etaMinutes: o.etaMinutes,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** Only people who said yes appear on a crew. Invitations are counted, never named. */
export const crewInclude = {
  members: { where: { status: "accepted" }, include: { worker: { include: { user: true } } } },
  _count: { select: { members: { where: { status: "invited" } } } },
} satisfies Prisma.CrewInclude;
type CrewFull = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

export async function toCrews(crews: CrewFull[]): Promise<CrewDto[]> {
  const workers = [...new Map(crews.flatMap((c) => c.members.map((m) => [m.workerId, m.worker] as const))).values()];
  const cards = new Map((await workerCards(workers)).map((c) => [c.id, c]));
  return crews.map((c) => {
    const members = c.members.map((m) => cards.get(m.workerId) as WorkerCard);
    return {
      id: c.id,
      name: c.name,
      leaderId: c.leaderId,
      members,
      categoryIds: c.categoryIds,
      rate: c.rate,
      available: members.length > 0 && members.every((m) => m.status === "available" && m.approved),
      pendingCount: c._count.members,
    };
  });
}

export function toAuthUser(user: User, workerId: string | null, hasHirerProfile: boolean): AuthUser {
  return { id: user.id, phone: user.phone, name: user.name, role: user.role, workerId, hasHirerProfile };
}
