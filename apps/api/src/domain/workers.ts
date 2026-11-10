import { createHash } from "node:crypto";
import type { OfflinePreset, WorkerCard } from "@kaamwala/contracts";
import { significantWords, tokenize } from "@kaamwala/jev";
import { Prisma, type WorkerProfile } from "@prisma/client";
import { AREAS } from "../areas";
import { resolvePlace } from "../places";
import type { AuthContext } from "../auth";
import { normalizePhone } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { conflict, forbidden, notFound, unprocessable } from "../errors";
import { endOfDayPkt } from "../geo";
import { hub } from "../hub";
import { getActiveCategories, jev } from "../jev";
import { workerCard, workerCards } from "../serialize";
import { cancelInTx } from "./jobs";
import { splitAgentFee } from "./pricing";
import { readSettings } from "./settings";
import { lockJob, lockWorkers, runTx, setStatus } from "./tx";

export interface SearchInput {
  lat?: number | undefined;
  lng?: number | undefined;
  radiusKm?: number | undefined;
  categoryId?: string | undefined;
  q?: string | undefined;
  minRating?: number | undefined;
}

export async function searchWorkers(input: SearchInput) {
  let categoryId = input.categoryId;
  let detected: { categoryId: string; confidence: number; skills: string[] } | null = null;
  const q = input.q?.trim();

  if (q) {
    const best = jev.match(q).best;
    if (best) {
      detected = { categoryId: best.categoryId, confidence: best.confidence, skills: best.skills.map((s) => s.skill) };
      categoryId ??= best.categoryId;
    }
  }

  // A disabled category cannot be booked, so its workers must not be offered either.
  const activeIds = getActiveCategories().map((c) => c.id);
  if (categoryId && !activeIds.includes(categoryId)) return { items: [], detected };

  const where: Prisma.WorkerProfileWhereInput = {
    status: "available",
    approved: true,
    user: { suspended: false },
    categoryIds: categoryId ? { has: categoryId } : { hasSome: activeIds },
  };
  let rows = await prisma.workerProfile.findMany({ where, include: { user: true } });

  if (q && !detected) {
    const words = significantWords(q);
    const matched = rows.filter((w) =>
      [w.user.name ?? "", w.area, ...w.skills].some((field) => {
        const text = tokenize(field).join(" ");
        return words.some((word) => text.includes(word));
      }),
    );
    // A chosen trade stands on its own: free text the matcher cannot read must not empty it.
    rows = matched.length > 0 || !input.categoryId ? matched : rows;
  }

  const origin = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : undefined;
  let items = await workerCards(rows, origin);
  if (origin) {
    const radius = input.radiusKm ?? 10;
    items = items.filter((w) => (w.distanceKm ?? 0) <= radius);
  }
  const { minRating } = input;
  if (minRating !== undefined) items = items.filter((w) => w.trust.rating >= minRating);
  return { items: sortWorkers(items), detected };
}

/** Distance first (in half-kilometre bands, so nearby workers compete on quality), then rating, then response rate. */
export function sortWorkers(items: WorkerCard[]): WorkerCard[] {
  const band = (w: WorkerCard) => Math.round((w.distanceKm ?? 0) * 2);
  return [...items].sort(
    (a, b) =>
      band(a) - band(b) ||
      b.trust.rating - a.trust.rating ||
      b.trust.responseRate - a.trust.responseRate ||
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0),
  );
}

export interface WorkerInput {
  name: string;
  area: string;
  categoryIds?: string[] | undefined;
  trade?: string | undefined;
  skills?: string[] | undefined;
  years?: number | undefined;
  rate?: number | undefined;
  location?: { lat: number; lng: number } | undefined;
  workingHours?: string | undefined;
  photoUrl?: string | undefined;
  cnic?: string | undefined;
  forPhone?: string | undefined;
}

const CNIC_TAKEN = "This CNIC is already linked to another account.";

function resolveCategories(input: { categoryIds?: string[] | undefined; trade?: string | undefined }): string[] {
  const active = new Set(getActiveCategories().map((c) => c.id));
  if (input.categoryIds?.length) {
    const unknown = input.categoryIds.filter((id) => !active.has(id));
    if (unknown.length) throw unprocessable("CATEGORY_NOT_FOUND", "One of these trades is not available.");
    return [...new Set(input.categoryIds)];
  }
  const best = input.trade ? jev.match(input.trade).best : null;
  if (!best) {
    throw unprocessable("TRADE_NOT_RECOGNISED", "We could not recognise this trade. Please pick one from the list.");
  }
  return [best.categoryId];
}

async function resolveLocation(area: string, location?: { lat: number; lng: number }) {
  const place = await resolvePlace(area, location);
  if (!place) throw unprocessable("LOCATION_REQUIRED", "Pick an area from the list or share your location.");
  return place;
}

function resolveSkills(input: WorkerInput | Partial<WorkerInput>, categoryIds: string[]): string[] {
  const fromTrade = input.trade ? categoryIds.flatMap((id) => jev.skillsFor(input.trade as string, id)) : [];
  return jev.normalizeSkills([...(input.skills ?? []), ...fromTrade], categoryIds);
}

/** The one path for voice-confirmed, typed and agent-created workers. */
export async function createWorker(auth: AuthContext, input: WorkerInput): Promise<WorkerCard> {
  const isAgent = auth.user.role === "agent";
  if (input.forPhone && !isAgent) throw forbidden("Only field agents can register someone else.");
  if (isAgent && !input.forPhone) throw unprocessable("PHONE_REQUIRED", "Enter the worker's phone number.");
  if (!isAgent && auth.user.role !== "worker") throw forbidden("Sign in as a worker first.");

  const categoryIds = resolveCategories(input);
  const place = await resolveLocation(input.area, input.location);
  const skills = resolveSkills(input, categoryIds);
  const defaultRate = Math.max(
    ...getActiveCategories()
      .filter((c) => categoryIds.includes(c.id))
      .map((c) => c.floorPrice),
  );

  const cnicDigits = input.cnic ? cleanCnic(input.cnic) : null;
  if (input.cnic && !cnicDigits) throw unprocessable("CNIC_UNREADABLE", "We could not read a 13-digit CNIC number.");

  // One transaction: a duplicate phone or CNIC leaves no worker and no ledger entry behind.
  // A phone that already has an account is never taken over: its name and role are its owner's.
  const profile = await prisma.$transaction(async (tx) => {
    let userId = auth.user.id;
    if (input.forPhone) {
      const phone = normalizePhone(input.forPhone);
      const owner = await tx.user.findUnique({ where: { phone }, include: { workerProfile: { select: { id: true } } } });
      if (owner?.workerProfile) throw conflict("ALREADY_REGISTERED", "This phone already has a worker profile.");
      if (owner) throw conflict("PHONE_IN_USE", "This phone already has an account. Its owner can sign up from their own phone.");
      const user = await tx.user.create({ data: { phone, name: input.name, role: "worker" } });
      userId = user.id;
    } else {
      await tx.user.update({ where: { id: userId }, data: { name: input.name } });
    }

    const existing = await tx.workerProfile.findUnique({ where: { userId } });
    if (existing) throw conflict("ALREADY_REGISTERED", "This phone already has a worker profile.");

    const created = await tx.workerProfile.create({
      data: {
        userId,
        categoryIds,
        skills,
        years: input.years ?? 0,
        rate: input.rate ?? defaultRate,
        area: place.area,
        lat: place.lat,
        lng: place.lng,
        workingHours: input.workingHours ?? null,
        photoUrl: input.photoUrl ?? null,
        approved: env.AUTO_APPROVE_WORKERS,
        status: env.AUTO_APPROVE_WORKERS ? "available" : "offline",
        createdByAgentId: isAgent ? auth.user.id : null,
      },
    });

    if (cnicDigits) {
      const hash = hashCnic(cnicDigits);
      if (await tx.cnicHash.findUnique({ where: { hash } })) throw conflict("CNIC_DUPLICATE", CNIC_TAKEN);
      await tx.cnicHash.create({ data: { workerId: created.id, hash } });
    }

    // Self-signup is free. Only an agent registering someone else records a fee, and collection is mocked.
    if (isAgent) {
      const settings = await readSettings(tx);
      const split = splitAgentFee(settings.agentSignupFee, settings.agentSharePercent);
      await tx.agentLedgerEntry.create({
        data: {
          agentId: auth.user.id,
          workerId: created.id,
          fee: settings.agentSignupFee,
          ...split,
          paymentStatus: "mock_collected",
        },
      });
    }
    return created;
  }).catch((err: unknown) => {
    // Two signups racing on one CNIC: the unique index stops the second.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target).includes("hash")) {
      throw conflict("CNIC_DUPLICATE", CNIC_TAKEN);
    }
    throw err;
  });

  if (profile.status === "available") {
    hub.broadcast({ type: "worker.status", workerId: profile.id, status: "available", offlineUntil: null });
  }
  return (await workerCard(profile.id)) as WorkerCard;
}

export async function updateWorker(worker: WorkerProfile, input: Partial<WorkerInput>, userId: string): Promise<WorkerCard> {
  const categoryIds =
    input.categoryIds?.length || input.trade ? resolveCategories(input) : worker.categoryIds;
  const place = input.area ? await resolveLocation(input.area, input.location) : null;
  const data: Prisma.WorkerProfileUpdateInput = {
    categoryIds,
    ...(input.skills || input.trade ? { skills: resolveSkills(input, categoryIds) } : {}),
    ...(input.years !== undefined ? { years: input.years } : {}),
    ...(input.rate !== undefined ? { rate: input.rate } : {}),
    ...(input.workingHours !== undefined ? { workingHours: input.workingHours } : {}),
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
    ...(place ?? {}),
  };
  await prisma.$transaction([
    prisma.workerProfile.update({ where: { id: worker.id }, data }),
    ...(input.name ? [prisma.user.update({ where: { id: userId }, data: { name: input.name } })] : []),
  ]);
  return (await workerCard(worker.id)) as WorkerCard;
}

const HOUR_MS = 60 * 60 * 1000;

function offlineUntilFor(preset: OfflinePreset, now = new Date()): Date | null {
  switch (preset) {
    case "1h":
      return new Date(now.getTime() + HOUR_MS);
    case "2h":
      return new Date(now.getTime() + 2 * HOUR_MS);
    case "today":
      return endOfDayPkt(now);
    case "manual":
      return null;
  }
}

/**
 * The big home-screen toggle. Refused while engaged. Going offline during an unanswered
 * request declines that request, so a customer is never left waiting on a hidden worker.
 */
export async function setAvailability(workerId: string, input: { available: boolean; preset?: OfflinePreset | undefined }) {
  await runTx(async (tx, fx) => {
    const assignment = await tx.jobAssignment.findFirst({ where: { workerId, active: true } });
    const job = assignment ? await lockJob(tx, assignment.jobId) : null;
    const [worker] = await lockWorkers(tx, [workerId]);
    if (!worker) throw notFound("Worker");
    if (worker.status === "engaged") throw conflict("WORKER_ENGAGED", "Finish the current job first.");
    if (!worker.approved) throw conflict("WORKER_NOT_APPROVED", "Your profile is waiting for approval.");

    if (input.available) {
      if (worker.status === "requested") return;
      await setStatus(tx, fx, [workerId], "available");
      return;
    }

    if (worker.status === "requested") {
      if (!job) throw conflict("TRY_AGAIN", "Please try again.");
      await cancelInTx(tx, fx, job, workerId);
      fx.push([job.customerId], {
        title: "کاریگر دستیاب نہیں",
        body: "کوئی اور کاریگر چنیں",
        url: `/app/jobs/${job.id}`,
        tag: job.id,
      });
    }
    await setStatus(tx, fx, [workerId], "offline", offlineUntilFor(input.preset ?? "manual"));
  });
  return (await workerCard(workerId)) as WorkerCard;
}

export const hashCnic = (digits: string) => createHash("sha256").update(`${env.CNIC_SALT}:${digits}`).digest("hex");

export function cleanCnic(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 13 ? digits : null;
}

/**
 * A CNIC checked after signup can turn out to be a duplicate. That signup must leave no ledger
 * entry, and the profile goes too unless it has already taken part in real work.
 */
async function voidDuplicateSignup(workerId: string): Promise<boolean> {
  const removed = await prisma.$transaction(async (tx) => {
    await tx.agentLedgerEntry.deleteMany({ where: { workerId } });
    const history = await Promise.all([
      tx.jobAssignment.count({ where: { workerId } }),
      tx.offer.count({ where: { workerId } }),
      tx.crew.count({ where: { leaderId: workerId } }),
    ]);
    if (history.some((n) => n > 0)) return false;
    await tx.workerProfile.delete({ where: { id: workerId } });
    return true;
  });
  if (removed) hub.broadcast({ type: "worker.status", workerId, status: "offline", offlineUntil: null });
  return removed;
}

/** Refuses a CNIC someone else holds. A signup with no valid CNIC of its own is undone as well. */
async function refuseDuplicate(workerId: string): Promise<never> {
  // Someone who already passed this check has only mistyped a later correction.
  const ownHash = await prisma.cnicHash.count({ where: { workerId } });
  if (!ownHash) await voidDuplicateSignup(workerId);
  throw conflict("CNIC_DUPLICATE", CNIC_TAKEN);
}

/** Stores only a salted hash. A CNIC already used by another worker is refused. */
export async function registerCnic(workerId: string, digits: string): Promise<void> {
  const hash = hashCnic(digits);
  const owner = await prisma.cnicHash.findUnique({ where: { hash } });
  if (owner && owner.workerId !== workerId) await refuseDuplicate(workerId);
  try {
    await prisma.cnicHash.upsert({ where: { workerId }, create: { workerId, hash }, update: { hash } });
  } catch (err) {
    // Two workers racing on one CNIC: the unique index stops the second. Anything else is a real fault.
    const onHash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target).includes("hash");
    if (!onHash) throw err;
    await refuseDuplicate(workerId);
  }
}

export const listAreas = () => AREAS;
