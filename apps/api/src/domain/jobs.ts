import type { Job as JobDto } from "@kaamwala/contracts";
import { Prisma, type Category } from "@prisma/client";
import type { AuthContext } from "../auth";
import { prisma, type Tx } from "../db";
import { env } from "../env";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../errors";
import { GeminiUnavailable, writeJobCard } from "../gemini";
import { distanceKm, fromDateOnly, todayPkt, toDateOnly } from "../geo";
import { jev } from "../jev";
import { pushToUsers } from "../push";
import { jobInclude, offerInclude, toJob, toOffers, type JobFull } from "../serialize";
import { bookedTime, dayDates, jobFacts } from "./days";
import { movePrice as nextPrice, splitEarnings, type PriceDirection } from "./pricing";
import { assertAllAvailable, lockJob, lockWorkers, releaseWorkers, runTx, setStatus, type Effects } from "./tx";

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
      assertAllAvailable(await lockWorkers(tx, [workerId]));
      const worker = await tx.workerProfile.findUniqueOrThrow({ where: { id: workerId } });
      if (worker.userId === auth.user.id) throw unprocessable("CANNOT_HIRE_SELF", "You cannot hire yourself.");
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
    const crew = await tx.crew.findUnique({ where: { id: crewId }, include: { members: true } });
    if (!crew) throw notFound("Crew");
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
  const origin = { lat: job.lat, lng: job.lng };
  const nearby = await prisma.workerProfile.findMany({
    where: { status: "available", approved: true, categoryIds: { has: category.id }, user: { suspended: false } },
    select: { id: true, userId: true, lat: true, lng: true },
  });
  const inRange = nearby.filter((w) => distanceKm(origin, w) <= env.OPEN_JOB_RADIUS_KM);
  let recipients = inRange.map((w) => w.userId);
  if (job.mode === "crew") {
    const crews = await prisma.crew.findMany({
      where: { categoryIds: { has: category.id } },
      select: { leader: { select: { userId: true } } },
    });
    recipients = crews.map((c) => c.leader.userId);
  }
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
        ...(workerId ? [{ assignments: { some: { workerId } } }, { offers: { some: { workerId } } }] : []),
      ],
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jobs.map(toJob);
}

export async function listOpenFeed(auth: AuthContext): Promise<JobDto[]> {
  const worker = auth.worker;
  if (!worker) throw forbidden("Finish worker sign-up first.");
  const leadsCrew = (await prisma.crew.count({ where: { leaderId: worker.id } })) > 0;
  const jobs = await prisma.job.findMany({
    where: {
      status: "open",
      categoryId: { in: worker.categoryIds },
      ...(leadsCrew ? {} : { mode: "open" as const }),
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return jobs.filter((j) => distanceKm({ lat: j.lat, lng: j.lng }, worker) <= env.OPEN_JOB_RADIUS_KM).map(toJob);
}

export async function getJob(auth: AuthContext, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw notFound("Job");
  await assertCanView(auth, job);
  return toJob(job);
}

async function assertCanView(auth: AuthContext, job: JobFull): Promise<void> {
  if (auth.user.role === "admin" || sideOf(auth, job)) return;
  if (auth.worker) {
    if (job.status === "open") return;
    const offered = await prisma.offer.count({ where: { jobId: job.id, workerId: auth.worker.id } });
    if (offered) return;
  }
  throw forbidden("You are not part of this job.");
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
  return toOffers(offers);
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
    if (!worker.categoryIds.includes(job.categoryId) && !input.crewId) {
      throw forbidden("This job is not in your trade.");
    }
    if (job.mode === "crew" && !input.crewId) throw unprocessable("CREW_REQUIRED", "Only crews can bid on this job.");
    if (job.mode === "open" && input.crewId) throw unprocessable("CREW_NOT_ALLOWED", "This job is for one worker.");

    if (input.crewId) {
      const crew = await tx.crew.findUnique({ where: { id: input.crewId }, include: { members: true } });
      if (!crew) throw notFound("Crew");
      if (crew.leaderId !== worker.id) throw forbidden("Only the crew leader can bid.");
      if (!crew.categoryIds.includes(job.categoryId)) throw forbidden("This job is not in your crew's trade.");
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

/** One transaction with job and worker row locks: a worker can never end up on two jobs. */
export async function acceptOffer(auth: AuthContext, jobId: string, offerId: string): Promise<JobDto> {
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    requireCustomer(auth, locked);
    requireStatus(locked, ["open"]);
    const offer = await tx.offer.findFirst({
      where: { id: offerId, jobId },
      include: { worker: true, crew: { include: { members: true } } },
    });
    if (!offer) throw notFound("Offer");
    if (offer.status !== "pending") throw conflict("OFFER_NOT_PENDING", "This offer is no longer open.");

    const workerIds = offer.crew ? offer.crew.members.map((m) => m.workerId) : [offer.workerId];
    assertAllAvailable(await lockWorkers(tx, workerIds));

    await tx.jobAssignment.createMany({ data: workerIds.map((workerId) => ({ jobId, workerId })) });
    await setStatus(tx, fx, workerIds, "requested");
    await tx.offer.update({ where: { id: offer.id }, data: { status: "accepted", acceptedAt: new Date() } });
    await tx.offer.updateMany({ where: { jobId, id: { not: offer.id }, status: "pending" }, data: { status: "rejected" } });
    const updated = await tx.job.update({
      where: { id: jobId },
      data: { status: "negotiating", proposedPrice: offer.price, proposedById: offer.worker.userId, crewId: offer.crewId },
      include: jobInclude,
    });
    fx.job(jobId);
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

const formatPkt = (d: Date) =>
  d.toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });

export async function generateCard(auth: AuthContext, jobId: string): Promise<JobDto> {
  const before = await prisma.job.findUnique({
    where: { id: jobId },
    include: { ...jobInclude, category: true, messages: { orderBy: { createdAt: "asc" }, take: 20 } },
  });
  if (!before) throw notFound("Job");
  requireDecider(auth, before);
  requireStatus(before, ["negotiating", "pending_confirmation"]);
  const price = before.proposedPrice;
  if (price === null) throw conflict("PRICE_REQUIRED", "Agree a price first.");

  // Days, dates and money always come from the database, never from the model.
  const totalPrice = price * before.durationDays;
  const booked = bookedTime(before, formatPkt);

  // The model call stays outside the transaction so a slow reply cannot hold row locks.
  let task = before.description.slice(0, 200);
  let time = booked ?? "Jald az jald";
  let source: "gemini" | "template" = "template";
  try {
    const card = await writeJobCard({
      description: before.description,
      area: before.area,
      scheduledFor: before.scheduledFor,
      categoryName: before.category.nameEn,
      transcripts: before.messages.flatMap((m) => m.transcript ?? m.text ?? []),
      facts: jobFacts(before),
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
    const updated = await tx.job.update({
      where: { id: jobId },
      data: {
        status: "pending_confirmation",
        agreedPrice: price,
        totalPrice,
        card: {
          task,
          addressArea: before.area,
          time,
          agreedPrice: price,
          pricePerDay: price,
          durationDays: before.durationDays,
          startDate: fromDateOnly(before.startDate),
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
  const job = await runTx(async (tx, fx) => {
    const locked = await lockJob(tx, jobId);
    const side = requireDecider(auth, locked);
    requireStatus(locked, ["pending_confirmation"]);

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
  return toJob(job);
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
  await tx.offer.updateMany({ where: { jobId: job.id, status: "pending" }, data: { status: "rejected" } });
  const workerIds = activeWorkerIds(job);
  await lockWorkers(tx, workerIds);
  await releaseWorkers(tx, fx, job, except);
  await tx.jobDay.updateMany({ where: { jobId: job.id, status: "scheduled" }, data: { status: "skipped" } });
  const updated = await tx.job.update({ where: { id: job.id }, data: { status: "cancelled" }, include: jobInclude });
  fx.job(job.id);
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
    requireParty(auth, locked);
    requireStatus(locked, ["engaged", "completed"]);
    if (locked.status === "engaged") {
      await lockWorkers(tx, activeWorkerIds(locked));
      await releaseWorkers(tx, fx, locked);
      await tx.jobDay.updateMany({ where: { jobId, status: "scheduled" }, data: { status: "skipped" } });
    }
    const updated = await tx.job.update({
      where: { id: jobId },
      data: { status: "disputed", disputeReason: reason },
      include: jobInclude,
    });
    fx.job(jobId);
    return updated;
  });
  return toJob(job);
}

export { requireParty, assertCanView };
