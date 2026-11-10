import type { JobFeedItem, Job as JobDto } from "@kaamwala/contracts";
import { Prisma, type Category } from "@prisma/client";
import type { AuthContext } from "../auth";
import { prisma, type Tx } from "../db";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../errors";
import { GeminiUnavailable, writeJobCard } from "../gemini";
import { distanceKm, fromDateOnly, todayPkt, toDateOnly } from "../geo";
import { jev } from "../jev";
import { pushToUsers } from "../push";
import { jobInclude, offerInclude, oneDecimal, toJob, toOffers, toOpenJobView, type JobFull } from "../serialize";
import { bookedTime, dayDates, jobFacts } from "./days";
import { priceEstimate, type PriceEstimate } from "./estimate";
import { feedTrades, mayBidOnTrade } from "./feedTrades";
import { openJobRecipients, withinOpenJobRadius, workerMatchesOpenJob } from "./openJobs";
import { movePrice as nextPrice, splitEarnings, type PriceDirection } from "./pricing";
import { assertAllAvailable, lockCrew, lockJob, lockWorkers, releaseWorkers, runTx, setStatus, type Effects } from "./tx";

type Side = "customer" | "worker" | "member";

function sideOf(auth: AuthContext, job: JobFull): Side | null {
  if (job.customerId === auth.user.id) return "customer";
  const worker = auth.worker;
  if (!worker || !job.assignments.some((a) => a.workerId === worker.id)) return null;
  return job.crew && job.crew.leaderId !== worker.id ? "member" : "worker";
}

function requireParty(auth: AuthContext, job: JobFull): Side {
  const side = sideOf(auth, job);
  if (!side) throw forbidden("You are not part of this job.");
  return side;
}

/** Customer, a solo worker, or the leader of the crew. Crew members follow their leader. */
function requireDecider(auth: AuthContext, job: JobFull): "customer" | "worker" {
  const side = requireParty(auth, job);
  if (side === "member") throw forbidden("Only the crew leader can do this.");
  return side;
}

function requireCustomer(auth: AuthContext, job: JobFull): void {
  if (job.customerId !== auth.user.id) throw forbidden("Only the customer can do this.");
}

function requireWorkerSide(auth: AuthContext, job: JobFull): void {
  if (requireDecider(auth, job) !== "worker") throw forbidden("Only the worker can do this.");
}

function requireStatus(job: JobFull, allowed: JobFull["status"][]): void {
  if (!allowed.includes(job.status)) {
    throw conflict("INVALID_JOB_STATE", `This job is ${job.status} and cannot do that now.`);
  }
}

const activeWorkerIds = (job: JobFull) => job.assignments.filter((a) => a.active).map((a) => a.workerId);

async function workerUserIds(tx: Tx, ids: string[]): Promise<string[]> {
  const rows = await tx.workerProfile.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

const jobUrl = (id: string) => `/app/jobs/${id}`;

const WRONG_TRADE = "This work is not in the trades they do.";
const MAX_UNANSWERED_REQUESTS = 3;

/** One customer cannot take the whole map off the market by sending everyone a request. */
async function assertRequestSlot(tx: Tx, customerId: string): Promise<void> {
  // Holding the customer's row makes two simultaneous requests count one after the other.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${customerId} FOR NO KEY UPDATE`;
  const waiting = await tx.job.count({ where: { customerId, status: "requested" } });
  if (waiting >= MAX_UNANSWERED_REQUESTS) {
    throw conflict("TOO_MANY_REQUESTS", "Please wait for an answer to your other requests, or cancel one.");
  }
}

export interface CreateJobInput {
  mode: "direct" | "open" | "crew";
  workerId?: string | undefined;
  crewId?: string | undefined;
  categoryId: string;
  description: string;
  area: string;
  location: { lat: number; lng: number };
  urgency?: "low" | "normal" | "urgent" | undefined;
  scheduledFor?: string | undefined;
  photoUrls?: string[] | undefined;
  /** Always per day. On a crew job, per day for the whole crew. */
  proposedPrice?: number | undefined;
  /** The per-day estimate the customer was shown. */
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  durationDays?: number | undefined;
  startDate?: string | undefined;
}

export async function createJob(auth: AuthContext, input: CreateJobInput): Promise<JobDto> {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, active: true } });
  if (!category) throw unprocessable("CATEGORY_NOT_FOUND", "This category is not available.");
  if (input.proposedPrice !== undefined && input.proposedPrice < category.floorPrice) {
    throw unprocessable("BELOW_FLOOR", `The minimum for this work is Rs ${category.floorPrice}.`);
  }
  if (input.mode === "crew" && !category.crewAllowed) {
    throw unprocessable("CREW_NOT_ALLOWED", "Crew jobs are not allowed in this category.");
  }

  await prisma.hirerProfile.upsert({
    where: { userId: auth.user.id },
    create: { userId: auth.user.id, area: input.area, lat: input.location.lat, lng: input.location.lng },
    update: {},
  });

  const estimateMin = input.priceMin === undefined ? null : Math.max(category.floorPrice, input.priceMin);
  const estimateMax = input.priceMax === undefined ? null : Math.max(estimateMin ?? category.floorPrice, input.priceMax);

  const base = {
    mode: input.mode,
    customerId: auth.user.id,
    categoryId: category.id,
    description: input.description,
    urgency: input.urgency ?? "normal",
    area: input.area,
    lat: input.location.lat,
    lng: input.location.lng,
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    photoUrls: input.photoUrls ?? [],
    floor: category.floorPrice,
    step: category.step,
    estimateMin,
    estimateMax,
    durationDays: input.durationDays ?? 1,
    startDate: toDateOnly(input.startDate ?? todayPkt()),
  };

  if (input.mode === "open" || (input.mode === "crew" && !input.crewId)) {
    const job = await runTx(async (tx, fx) => {
      const created = await tx.job.create({
        data: {
          ...base,
          status: "open",
          proposedPrice: input.proposedPrice ?? null,
          proposedById: input.proposedPrice ? auth.user.id : null,
        },
        include: jobInclude,
      });
      fx.job(created.id);
      return created;
    });
    void notifyOpenJob(job, category).catch((err) => console.error("open job push failed", err));
    return toJob(job);
  }

  if (input.mode === "direct") {
    const workerId = input.workerId;
    if (!workerId) throw badRequest("WORKER_REQUIRED", "Choose a worker first.");
    const job = await runTx(async (tx, fx) => {
      await assertRequestSlot(tx, auth.user.id);
      assertAllAvailable(await lockWorkers(tx, [workerId]));
      const worker = await tx.workerProfile.findUniqueOrThrow({ where: { id: workerId } });
      if (worker.userId === auth.user.id) throw unprocessable("CANNOT_HIRE_SELF", "You cannot hire yourself.");
      if (!worker.categoryIds.includes(category.id)) throw unprocessable("WRONG_TRADE", WRONG_TRADE);
      const created = await tx.job.create({
        data: {
          ...base,
          status: "requested",
          proposedPrice: Math.max(category.floorPrice, input.proposedPrice ?? worker.rate),
          proposedById: auth.user.id,
          assignments: { create: [{ workerId }] },
        },
        include: jobInclude,
      });
      await setStatus(tx, fx, [workerId], "requested");
      await tx.workerProfile.update({ where: { id: workerId }, data: { requestsReceived: { increment: 1 } } });
      fx.job(created.id);
      fx.push([worker.userId], {
        title: "نئی درخواست",
        body: `${category.nameUr}: ${input.area}`,
        url: jobUrl(created.id),
        tag: created.id,
      });
      return created;
    });
    return toJob(job);
  }

  const crewId = input.crewId as string;
  const job = await runTx(async (tx, fx) => {
    await assertRequestSlot(tx, auth.user.id);
    const crew = await lockCrew(tx, crewId);
    if (!crew.categoryIds.includes(category.id)) throw unprocessable("WRONG_TRADE", WRONG_TRADE);
    if (crew.members.some((m) => m.worker.userId === auth.user.id)) {
      throw unprocessable("CANNOT_HIRE_SELF", "You cannot hire your own crew.");
    }
    const memberIds = crew.members.map((m) => m.workerId);
    assertAllAvailable(await lockWorkers(tx, memberIds));
    const created = await tx.job.create({
      data: {
        ...base,
        status: "requested",
        crewId: crew.id,
        proposedPrice: Math.max(category.floorPrice, input.proposedPrice ?? crew.rate),
        proposedById: auth.user.id,
        assignments: { create: memberIds.map((workerId) => ({ workerId })) },
      },
      include: jobInclude,
    });
    await setStatus(tx, fx, memberIds, "requested");
    await tx.workerProfile.updateMany({
      where: { id: { in: memberIds } },
      data: { requestsReceived: { increment: 1 } },
    });
    fx.job(created.id);
    fx.push(await workerUserIds(tx, memberIds), {
      title: "ٹیم کے لیے نئی درخواست",
      body: `${category.nameUr}: ${input.area}`,
      url: jobUrl(created.id),
      tag: created.id,
    });
    return created;
  });
  return toJob(job);
}

async function notifyOpenJob(job: JobFull, category: Category): Promise<void> {
  const recipients = (await openJobRecipients(job)).filter((r) => r.ready).map((r) => r.userId);
  await pushToUsers(recipients, {
    title: "قریب نیا کام",
    body: `${category.nameUr}: ${job.area}`,
    url: jobUrl(job.id),
    tag: job.id,
  });
}

export async function listMine(auth: AuthContext): Promise<JobDto[]> {
  const workerId = auth.worker?.id;
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { customerId: auth.user.id },
        ...(workerId
          ? [{ assignments: { some: { workerId } } }, { offers: { some: { workerId, status: "pending" as const } } }]
          : []),
      ],
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jobs.map((job) => (sideOf(auth, job) ? toJob(job) : toOpenJobView(job)));
}

export async function listOpenFeed(auth: AuthContext): Promise<JobFeedItem[]> {
  const worker = auth.worker;
  if (!worker) throw forbidden("Finish worker sign-up first.");
  if (!worker.approved) return [];
  // A crew can take work its leader does not personally do, so crew jobs follow the crews' trades.
  const led = await prisma.crew.findMany({ where: { leaderId: worker.id }, select: { categoryIds: true } });
  const crewTrades = [...new Set(led.flatMap((c) => c.categoryIds))];
  const jobs = await prisma.job.findMany({
    where: {
      status: "open",
      customerId: { not: auth.user.id },
      OR: [
        { mode: "open", categoryId: { in: feedTrades(worker) } },
        { mode: "crew", categoryId: { in: crewTrades } },
      ],
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const near = jobs.filter((j) => withinOpenJobRadius(j, worker));

  // A job with no estimate of its own shows what workers in that trade really charge.
  const unpriced = [...new Set(near.filter((j) => j.estimateMin === null).map((j) => j.categoryId))];
  const estimates = new Map<string, PriceEstimate>(
    await Promise.all(unpriced.map(async (id) => [id, await priceEstimate(id)] as const)),
  );

  return near.map((job) => {
    const view = toOpenJobView(job);
    const estimate = estimates.get(job.categoryId);
    return {
      ...view,
      priceMin: job.estimateMin ?? estimate?.min ?? null,
      priceMax: job.estimateMax ?? estimate?.max ?? null,
      // Measured from the rounded location, so it reveals nothing the view does not already show.
      distanceKm: oneDecimal(distanceKm(view.location, worker)),
    };
  });
}

export async function getJob(auth: AuthContext, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw notFound("Job");
  return (await hasFullView(auth, job)) ? toJob(job) : toOpenJobView(job);
}

/** True for the job's own people, false for a worker who may only see it as open work. */
async function hasFullView(auth: AuthContext, job: JobFull): Promise<boolean> {
  if (auth.user.role === "admin" || sideOf(auth, job)) return true;
  if (auth.worker) {
    const bidding = await prisma.offer.count({ where: { jobId: job.id, workerId: auth.worker.id, status: "pending" } });
    if (bidding) return false;
    if (job.status === "open" && (await workerMatchesOpenJob(auth.worker, job))) return false;
  }
  throw forbidden("You are not part of this job.");
}

/** The chat is private to the job's own people. Having bid on the job gives no right to read it. */
export function assertCanReadMessages(auth: AuthContext, job: JobFull): void {
  if (auth.user.role !== "admin") requireParty(auth, job);
}

export async function listOffers(auth: AuthContext, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: jobInclude });
  if (!job) throw notFound("Job");
  const isCustomer = job.customerId === auth.user.id || auth.user.role === "admin";
  if (!isCustomer && !auth.worker) throw forbidden();
  const offers = await prisma.offer.findMany({
    where: { jobId, ...(isCustomer ? {} : { workerId: auth.worker?.id ?? "" }) },
    include: offerInclude,
    orderBy: { price: "asc" },
  });
  // Distance is measured from the exact spot, which only the customer's side may work out.
  return toOffers(offers, isCustomer ? { lat: job.lat, lng: job.lng } : undefined);
}

export async function createOffer(
  auth: AuthContext,
  jobId: string,
  input: { price: number; etaMinutes?: number | undefined; crewId?: string | undefined },
) {
  const worker = auth.worker;
  if (!worker) throw forbidden("Finish worker sign-up first.");

  const offerId = await runTx(async (tx, fx) => {
    const job = await lockJob(tx, jobId);
    requireStatus(job, ["open"]);
    if (job.customerId === auth.user.id) throw unprocessable("CANNOT_HIRE_SELF", "You cannot bid on your own job.");
    if (input.price < job.floor) throw unprocessable("BELOW_FLOOR", `The minimum for this work is Rs ${job.floor}.`);
    if (!mayBidOnTrade(worker, job.categoryId) && !input.crewId) {
      throw forbidden("This job is not in your trade.");
    }
    if (job.mode === "crew" && !input.crewId) throw unprocessable("CREW_REQUIRED", "Only crews can bid on this job.");
    if (job.mode === "open" && input.crewId) throw unprocessable("CREW_NOT_ALLOWED", "This job is for one worker.");
    if (!withinOpenJobRadius(job, worker)) throw forbidden("This job is too far from your area.");

    if (input.crewId) {
      const crew = await lockCrew(tx, input.crewId);
      if (crew.leaderId !== worker.id) throw forbidden("Only the crew leader can bid.");
      if (!crew.categoryIds.includes(job.categoryId)) throw forbidden("This job is not in your crew's trade.");
      if (crew.members.some((m) => m.worker.userId === job.customerId)) {
        throw unprocessable("CANNOT_HIRE_SELF", "You cannot bid on your own job.");
      }
      assertAllAvailable(await lockWorkers(tx, crew.members.map((m) => m.workerId)));
    } else {
      assertAllAvailable(await lockWorkers(tx, [worker.id]));
    }

    const existing = await tx.offer.findUnique({ where: { jobId_workerId: { jobId, workerId: worker.id } } });
    const data = { price: input.price, etaMinutes: input.etaMinutes ?? null, crewId: input.crewId ?? null, status: "pending" as const };
    const offer = await tx.offer.upsert({
      where: { jobId_workerId: { jobId, workerId: worker.id } },
      create: { jobId, workerId: worker.id, ...data },
      update: data,
    });
    fx.offer(offer.id, existing ? "offer.updated" : "offer.created");
    fx.push([job.customerId], {
      title: "نئی پیشکش",
      body: `Rs ${input.price}`,
      url: jobUrl(job.id),
      tag: job.id,
    });
    return offer.id;
  });

  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  const [dto] = await toOffers([offer]);
  return dto;
}

/** Each bidder learns their own result, and that is all they learn about the job from here on. */
async function rejectPendingOffers(tx: Tx, fx: Effects, jobId: string, exceptOfferId?: string): Promise<void> {
  const pending = await tx.offer.findMany({
    where: { jobId, status: "pending", ...(exceptOfferId ? { id: { not: exceptOfferId } } : {}) },
    select: { id: true },
  });
  if (!pending.length) return;
  await tx.offer.updateMany({ where: { id: { in: pending.map((o) => o.id) } }, data: { status: "rejected" } });
  for (const { id } of pending) fx.offer(id, "offer.updated");
}

/** One transaction with job and worker row locks: a worker can never end up on two jobs. */
export async function acceptOffer(auth: AuthContext, jobId: string, offerId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireCustomer(auth, locked);
    requireStatus(locked, ["open"]);
    const offer = await tx.offer.findFirst({
      where: { id: offerId, jobId },
      include: { worker: true },
    });
    if (!offer) throw notFound("Offer");
    if (offer.status !== "pending") throw conflict("OFFER_NOT_PENDING", "This offer is no longer open.");

    let workerIds = [offer.workerId];
    if (offer.crewId) {
      // The crew as it stands now, not as it stood when the leader bid.
      const crew = await lockCrew(tx, offer.crewId);
      if (crew.members.some((m) => m.worker.userId === auth.user.id)) {
        throw unprocessable("CANNOT_HIRE_SELF", "You cannot hire your own crew.");
      }
      workerIds = crew.members.map((m) => m.workerId);
    }
    assertAllAvailable(await lockWorkers(tx, workerIds));

    await tx.jobAssignment.createMany({ data: workerIds.map((workerId) => ({ jobId, workerId })) });
    await setStatus(tx, fx, workerIds, "requested");
    await tx.offer.update({ where: { id: offer.id }, data: { status: "accepted", acceptedAt: new Date() } });
    await rejectPendingOffers(tx, fx, jobId, offer.id);
    const updated = await tx.job.update({
      where: { id: jobId },
      data: { status: "negotiating", proposedPrice: offer.price, proposedById: offer.worker.userId, crewId: offer.crewId },
      include: jobInclude,
    });
    fx.job(jobId);
    fx.jobClosed(jobId);
    fx.offer(offer.id, "offer.updated");
    fx.push(await workerUserIds(tx, workerIds), {
      title: "آپ کی پیشکش قبول ہو گئی",
      body: `Rs ${offer.price}`,
      url: jobUrl(jobId),
      tag: jobId,
    });
    return updated;
  });
  return toJob(job);
}

export async function workerAccept(auth: AuthContext, jobId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireWorkerSide(auth, locked);
    requireStatus(locked, ["requested"]);
    await lockWorkers(tx, activeWorkerIds(locked));
    await tx.workerProfile.updateMany({
      where: { id: { in: activeWorkerIds(locked) } },
      data: { requestsAnswered: { increment: 1 } },
    });
    await tx.jobAssignment.updateMany({ where: { jobId, respondedAt: null }, data: { respondedAt: new Date() } });
    const updated = await tx.job.update({ where: { id: jobId }, data: { status: "negotiating" }, include: jobInclude });
    fx.job(jobId);
    fx.push([locked.customerId], {
      title: "کاریگر نے درخواست قبول کر لی",
      body: locked.area,
      url: jobUrl(jobId),
      tag: jobId,
    });
    return updated;
  });
  return toJob(job);
}

export async function workerDecline(auth: AuthContext, jobId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireWorkerSide(auth, locked);
    requireStatus(locked, ["requested"]);
    await lockWorkers(tx, activeWorkerIds(locked));
    await tx.workerProfile.updateMany({
      where: { id: { in: activeWorkerIds(locked) } },
      data: { requestsAnswered: { increment: 1 } },
    });
    await tx.jobAssignment.updateMany({ where: { jobId, respondedAt: null }, data: { respondedAt: new Date() } });
    await releaseWorkers(tx, fx, locked);
    const updated = await tx.job.update({ where: { id: jobId }, data: { status: "cancelled" }, include: jobInclude });
    fx.job(jobId);
    fx.push([locked.customerId], {
      title: "کاریگر دستیاب نہیں",
      body: "کوئی اور کاریگر چنیں",
      url: jobUrl(jobId),
      tag: jobId,
    });
    return updated;
  });
  return toJob(job);
}

export async function movePrice(auth: AuthContext, jobId: string, direction: PriceDirection): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireDecider(auth, locked);
    requireStatus(locked, ["requested", "negotiating", "pending_confirmation"]);
    const next = nextPrice(locked.proposedPrice ?? locked.floor, direction, locked.step, locked.floor);
    if (next === null) throw unprocessable("BELOW_FLOOR", `The minimum for this work is Rs ${locked.floor}.`);
    const updated = await tx.job.update({
      where: { id: jobId },
      data: {
        proposedPrice: next,
        proposedById: auth.user.id,
        // A changed price voids the card, so nobody confirms a number they did not see.
        ...(locked.status === "pending_confirmation"
          ? {
              status: "negotiating" as const,
              card: Prisma.DbNull,
              customerConfirmed: false,
              workerConfirmed: false,
              agreedPrice: null,
              totalPrice: null,
            }
          : {}),
      },
      include: jobInclude,
    });
    fx.job(jobId);
    return updated;
  });
  return toJob(job);
}

const startHasPassed = (job: { startDate: Date }) => fromDateOnly(job.startDate) < todayPkt();

const cardStillStands = (job: JobFull, price: number) =>
  job.status === "pending_confirmation" && job.card !== null && job.agreedPrice === price && !startHasPassed(job);

const formatPkt = (d: Date) =>
  d.toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });

export async function generateCard(auth: AuthContext, jobId: string): Promise<JobDto> {
  const before = await prisma.job.findUnique({
    where: { id: jobId },
    // Newest first, because the final agreement is what the card has to reflect.
    include: { ...jobInclude, category: true, messages: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!before) throw notFound("Job");
  requireDecider(auth, before);
  requireStatus(before, ["negotiating", "pending_confirmation"]);
  const price = before.proposedPrice;
  if (price === null) throw conflict("PRICE_REQUIRED", "Agree a price first.");

  // Both sides often tap at once. A card already waiting for them stays, so a confirmation is never lost.
  if (cardStillStands(before, price)) return toJob(before);

  // A job that sat past its start date is booked from today, so no card ever names days already gone.
  const schedule = startHasPassed(before) ? { ...before, startDate: toDateOnly(todayPkt()), scheduledFor: null } : before;

  // Days, dates and money always come from the database, never from the model.
  const totalPrice = price * before.durationDays;
  const booked = bookedTime(schedule, formatPkt);

  // The model call stays outside the transaction so a slow reply cannot hold row locks.
  let task = before.description.slice(0, 200);
  let time = booked ?? "Jald az jald";
  let source: "gemini" | "template" = "template";
  try {
    const card = await writeJobCard({
      description: before.description,
      area: before.area,
      scheduledFor: schedule.scheduledFor,
      categoryName: before.category.nameEn,
      transcripts: [...before.messages].reverse().flatMap((m) => m.transcript ?? m.text ?? []),
      facts: jobFacts(schedule),
    });
    task = card.task;
    time = booked ?? card.time;
    source = "gemini";
  } catch (err) {
    if (!(err instanceof GeminiUnavailable)) throw err;
  }

  const skills = jev.skillsFor(`${task} ${before.description}`, before.categoryId);

  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireStatus(locked, ["negotiating", "pending_confirmation"]);
    if (locked.proposedPrice !== price) throw conflict("PRICE_CHANGED", "The price changed. Try again.");
    // The model call above is slow: the other side may have made a card and confirmed meanwhile.
    if (cardStillStands(locked, price)) return locked;
    const updated = await tx.job.update({
      where: { id: jobId },
      data: {
        status: "pending_confirmation",
        agreedPrice: price,
        totalPrice,
        startDate: schedule.startDate,
        scheduledFor: schedule.scheduledFor,
        card: {
          task,
          addressArea: before.area,
          time,
          agreedPrice: price,
          pricePerDay: price,
          durationDays: before.durationDays,
          startDate: fromDateOnly(schedule.startDate),
          totalPrice,
          source,
          skills,
        },
        customerConfirmed: false,
        workerConfirmed: false,
      },
      include: jobInclude,
    });
    fx.job(jobId);
    return updated;
  });
  return toJob(job);
}

/** When both sides have confirmed, every assigned worker goes to engaged in this one transaction. */
export async function confirmJob(auth: AuthContext, jobId: string): Promise<JobDto> {
  const result = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    const side = requireDecider(auth, locked);
    requireStatus(locked, ["pending_confirmation"]);

    // The dates on this card are gone, so nobody may confirm them. Booking from today needs a new card.
    if (startHasPassed(locked)) {
      await tx.job.update({
        where: { id: jobId },
        data: {
          status: "negotiating",
          card: Prisma.DbNull,
          customerConfirmed: false,
          workerConfirmed: false,
          agreedPrice: null,
          totalPrice: null,
          startDate: toDateOnly(todayPkt()),
          scheduledFor: null,
        },
      });
      fx.job(jobId);
      return null;
    }

    const customerConfirmed = locked.customerConfirmed || side === "customer";
    const workerConfirmed = locked.workerConfirmed || side === "worker";
    const both = customerConfirmed && workerConfirmed;

    if (both) {
      const workerIds = activeWorkerIds(locked);
      const workers = await lockWorkers(tx, workerIds);
      if (!workers.length || workers.some((w) => w.status !== "requested")) {
        throw conflict("WORKER_NOT_AVAILABLE", "A worker on this job is no longer free.");
      }
      // Engaged from now through the last day, even when the start date is in the future.
      await setStatus(tx, fx, workerIds, "engaged");
      await tx.jobDay.createMany({
        data: dayDates(fromDateOnly(locked.startDate), locked.durationDays).map((date, i) => ({
          jobId,
          dayNumber: i + 1,
          date: toDateOnly(date),
        })),
      });
    }

    const updated = await tx.job.update({
      where: { id: jobId },
      data: { customerConfirmed, workerConfirmed, ...(both ? { status: "engaged" as const, engagedAt: new Date() } : {}) },
      include: jobInclude,
    });
    fx.job(jobId);
    if (both) {
      fx.push(
        [locked.customerId, ...(await workerUserIds(tx, activeWorkerIds(locked)))],
        { title: "بکنگ پکی ہو گئی", body: `Rs ${locked.agreedPrice}`, url: jobUrl(jobId), tag: jobId },
      );
    }
    return updated;
  });
  if (!result) throw conflict("CARD_OUTDATED", "The start date on this job card has passed. Please make a new card.");
  return toJob(result);
}

/** Marks one day done and pays it. A crew's day adds up exactly to the per-day price. */
async function recordDay(tx: Tx, job: JobFull, dayNumber: number, now: Date): Promise<void> {
  await tx.jobDay.update({
    where: { jobId_dayNumber: { jobId: job.id, dayNumber } },
    data: { status: "completed", completedAt: now },
  });
  const workerIds = activeWorkerIds(job);
  const leaderFirst = job.crew
    ? [job.crew.leaderId, ...workerIds.filter((id) => id !== job.crew?.leaderId)]
    : workerIds;
  const shares = splitEarnings(job.agreedPrice as number, leaderFirst.length);
  await tx.earning.createMany({
    data: leaderFirst.map((workerId, i) => ({
      workerId,
      jobId: job.id,
      dayNumber,
      amount: shares[i] as number,
      categoryId: job.categoryId,
      earnedAt: now,
    })),
  });
}

/** Ends the job and sends its workers through completed, back to available. Unworked days are skipped. */
async function finishJob(tx: Tx, fx: Effects, job: JobFull, completedDays: number, now: Date): Promise<JobFull> {
  const workerIds = activeWorkerIds(job);
  await lockWorkers(tx, workerIds);
  await tx.jobDay.updateMany({ where: { jobId: job.id, status: "scheduled" }, data: { status: "skipped" } });
  await tx.jobAssignment.updateMany({ where: { jobId: job.id, active: true }, data: { active: false } });
  await setStatus(tx, fx, workerIds, "completed");
  const updated = await tx.job.update({
    where: { id: job.id },
    data: { status: "completed", completedAt: now, totalPrice: (job.agreedPrice as number) * completedDays },
    include: jobInclude,
  });
  fx.job(job.id);
  fx.push([job.customerId], {
    title: "کام مکمل ہو گیا",
    body: "اپنی رائے دیں",
    url: jobUrl(job.id),
    tag: job.id,
  });
  return updated;
}

const countCompleted = (job: JobFull) => job.days.filter((d) => d.status === "completed").length;

/** Idempotent: completing a finished day changes nothing and pays nothing again. */
export async function completeDay(auth: AuthContext, jobId: string, dayNumber: number): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireWorkerSide(auth, locked);
    const day = locked.days.find((d) => d.dayNumber === dayNumber);
    if (day?.status === "completed") return locked;
    requireStatus(locked, ["engaged"]);
    if (!day) throw notFound("Day");
    if (day.status === "skipped") throw conflict("DAY_SKIPPED", "This day was skipped.");

    const now = new Date();
    await recordDay(tx, locked, dayNumber, now);

    const remaining = locked.days.filter((d) => d.status === "scheduled" && d.dayNumber !== dayNumber).length;
    if (remaining === 0) return finishJob(tx, fx, locked, countCompleted(locked) + 1, now);

    fx.job(jobId);
    fx.push([locked.customerId], {
      title: `دن ${dayNumber} مکمل`,
      body: `${remaining} دن باقی`,
      url: jobUrl(jobId),
      tag: `${jobId}-day-${dayNumber}`,
    });
    return tx.job.findUniqueOrThrow({ where: { id: jobId }, include: jobInclude });
  });
  return toJob(job);
}

/** On a job over several days this finishes early, and only the completed days are charged. */
export async function completeJob(auth: AuthContext, jobId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireDecider(auth, locked);
    requireStatus(locked, ["engaged"]);
    const now = new Date();

    if (locked.durationDays === 1) {
      await recordDay(tx, locked, 1, now);
      return finishJob(tx, fx, locked, 1, now);
    }

    const completed = countCompleted(locked);
    if (completed === 0) {
      throw conflict("NO_DAYS_COMPLETED", "No day has been completed yet. Cancel the job instead.");
    }
    return finishJob(tx, fx, locked, completed, now);
  });
  return toJob(job);
}

async function cancelInTx(tx: Tx, fx: Effects, job: JobFull, except?: string): Promise<JobFull> {
  await rejectPendingOffers(tx, fx, job.id);
  const workerIds = activeWorkerIds(job);
  await lockWorkers(tx, workerIds);
  await releaseWorkers(tx, fx, job, except);
  await tx.jobDay.updateMany({ where: { jobId: job.id, status: "scheduled" }, data: { status: "skipped" } });
  const updated = await tx.job.update({ where: { id: job.id }, data: { status: "cancelled" }, include: jobInclude });
  fx.job(job.id);
  if (job.status === "open") fx.jobClosed(job.id);
  return updated;
}

export { cancelInTx };

export async function cancelJob(auth: AuthContext, jobId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    const side = requireDecider(auth, locked);
    requireStatus(locked, ["open", "requested", "negotiating", "pending_confirmation", "engaged"]);
    if (countCompleted(locked) > 0) {
      throw conflict("DAYS_ALREADY_COMPLETED", "Some days are already done. Finish the job early instead.");
    }
    const updated = await cancelInTx(tx, fx, locked);
    const others =
      side === "customer" ? await workerUserIds(tx, activeWorkerIds(locked)) : [locked.customerId];
    fx.push(others, { title: "کام منسوخ ہو گیا", body: locked.area, url: jobUrl(jobId), tag: jobId });
    return updated;
  });
  return toJob(job);
}

export async function disputeJob(auth: AuthContext, jobId: string, reason: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    const ongoing = locked.status === "engaged";
    // A dispute during the work ends it for everyone, so only those who decide for the job can raise one.
    const side = ongoing ? requireDecider(auth, locked) : requireParty(auth, locked);
    requireStatus(locked, ["engaged", "completed"]);
    const workers = await workerUserIds(tx, locked.assignments.map((a) => a.workerId));
    if (ongoing) {
      await lockWorkers(tx, activeWorkerIds(locked));
      await releaseWorkers(tx, fx, locked);
      await tx.jobDay.updateMany({ where: { jobId, status: "scheduled" }, data: { status: "skipped" } });
    }
    const updated = await tx.job.update({
      where: { id: jobId },
      data: {
        status: "disputed",
        disputeReason: reason,
        disputedAt: new Date(),
        // Only the days actually worked are owed, as on an early finish.
        ...(ongoing ? { totalPrice: (locked.agreedPrice as number) * countCompleted(locked) } : {}),
      },
      include: jobInclude,
    });
    fx.job(jobId);
    fx.push(side === "customer" ? workers : [locked.customerId], {
      title: "شکایت درج ہو گئی",
      body: locked.area,
      url: jobUrl(jobId),
      tag: jobId,
    });
    return updated;
  });
  return toJob(job);
}

/**
 * Suspension must always be possible, so a job in the way ends with it, in the same transaction.
 * Days already worked stay paid, as on an early finish.
 */
export async function suspendWorker(workerId: string): Promise<{ userId: string; endedJobId: string | null }> {
  return runTx(async (tx, fx) => {
    const profile = await tx.workerProfile.findUnique({ where: { id: workerId } });
    if (!profile) throw notFound("Worker");
    const assignment = await tx.jobAssignment.findFirst({ where: { workerId, active: true } });
    const job = assignment ? await lockJob(tx, assignment.jobId) : null;
    await lockWorkers(tx, [workerId]);

    let endedJobId: string | null = null;
    if (job?.assignments.some((a) => a.workerId === workerId && a.active)) {
      endedJobId = job.id;
      const worked = countCompleted(job);
      const others = (await workerUserIds(tx, activeWorkerIds(job))).filter((id) => id !== profile.userId);
      if (job.status === "engaged" && worked > 0) await finishJob(tx, fx, job, worked, new Date());
      else await cancelInTx(tx, fx, job, workerId);
      fx.push([job.customerId, ...others], { title: "کام منسوخ ہو گیا", body: job.area, url: jobUrl(job.id), tag: job.id });
    }

    await tx.workerProfile.update({ where: { id: workerId }, data: { approved: false } });
    await tx.user.update({ where: { id: profile.userId }, data: { suspended: true } });
    await setStatus(tx, fx, [workerId], "offline");
    return { userId: profile.userId, endedJobId };
  });
}

export { requireParty };
