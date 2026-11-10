import type { WorkerStatus, WsEvent } from "@kaamwala/contracts";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { conflict, notFound } from "../errors";
import { hub } from "../hub";
import { pushToUsers, type PushPayload } from "../push";
import { jobInclude, offerInclude, toJob, toOffers, toOpenJobView, type JobFull } from "../serialize";
import { openJobRecipients } from "./openJobs";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/** Events to publish only after the transaction has committed. */
export class Effects {
  private statuses: { workerId: string; status: WorkerStatus; offlineUntil: Date | null }[] = [];
  private jobs = new Set<string>();
  private offers: { id: string; type: "offer.created" | "offer.updated" }[] = [];
  private pushes: { userIds: string[]; payload: PushPayload }[] = [];

  status(workerId: string, status: WorkerStatus, offlineUntil: Date | null): void {
    this.statuses.push({ workerId, status, offlineUntil });
  }

  job(id: string): void {
    this.jobs.add(id);
  }

  offer(id: string, type: "offer.created" | "offer.updated"): void {
    this.offers.push({ id, type });
  }

  push(userIds: string[], payload: PushPayload): void {
    this.pushes.push({ userIds, payload });
  }

  async flush(): Promise<void> {
    for (const s of this.statuses) {
      hub.broadcast({
        type: "worker.status",
        workerId: s.workerId,
        status: s.status,
        offlineUntil: s.offlineUntil?.toISOString() ?? null,
      });
    }
    await Promise.all([...this.jobs].map(publishJob));
    for (const offer of this.offers) await publishOffer(offer.id, offer.type);
    for (const { userIds, payload } of this.pushes) {
      void pushToUsers(userIds, payload).catch(() => undefined);
    }
  }
}

async function publishJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      ...jobInclude,
      assignments: { select: { workerId: true, active: true, worker: { select: { userId: true } } } },
      offers: { where: { status: "pending" }, select: { worker: { select: { userId: true } } } },
    },
  });
  if (!job) return;
  const parties = [job.customerId, ...job.assignments.map((a) => a.worker.userId)];
  hub.toUsers(parties, { type: "job.updated", job: toJob(job) });
  if (job.status !== "open") return;

  // Everyone else gets the reduced view, and only if this job is meant for them.
  // The role check is the database's: an account now signed in as a customer is out of the feed.
  const recipients = await openJobRecipients(job);
  const bidders = new Set([
    ...recipients.filter((r) => r.role === "worker").map((r) => r.userId),
    ...job.offers.map((o) => o.worker.userId),
  ]);
  for (const party of parties) bidders.delete(party);
  const reduced: WsEvent = { type: "job.updated", job: toOpenJobView(job) };
  hub.toUsersOnly(bidders, reduced);
}

async function publishOffer(id: string, type: "offer.created" | "offer.updated"): Promise<void> {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { ...offerInclude, job: { select: { customerId: true } } },
  });
  if (!offer) return;
  const [dto] = await toOffers([offer]);
  if (dto) hub.toUsers([offer.job.customerId, offer.worker.userId], { type, offer: dto });
}

/** Runs one transaction. Events and pushes go out only if it commits. */
export async function runTx<T>(fn: (tx: Tx, fx: Effects) => Promise<T>): Promise<T> {
  const fx = new Effects();
  let result: T;
  try {
    result = await prisma.$transaction((tx) => fn(tx, fx), TX_OPTIONS);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      if (target.includes("workerId") || target.includes("one_active")) {
        throw conflict("WORKER_NOT_AVAILABLE", "This worker already has an active job.");
      }
    }
    throw err;
  }
  await fx.flush().catch((err) => console.error("publishing events failed", err));
  return result;
}

/** Lock order everywhere is job first, then workers sorted by id, so transactions cannot deadlock. */
export async function lockJob(tx: Tx, id: string): Promise<JobFull> {
  await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${id} FOR UPDATE`;
  const job = await tx.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw notFound("Job");
  return job;
}

/**
 * Serialises everything that reads a crew's members and then books them, so a member cannot
 * leave between the read and the booking. Lock order is job, then crew, then workers.
 */
export async function lockCrew(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Crew" WHERE id = ${id} FOR NO KEY UPDATE`;
  const crew = await tx.crew.findUnique({
    where: { id },
    include: { members: { where: { status: "accepted" }, include: { worker: { select: { userId: true } } } } },
  });
  if (!crew) throw notFound("Crew");
  return crew;
}

export interface LockedWorker {
  id: string;
  status: WorkerStatus;
  approved: boolean;
}

export async function lockWorkers(tx: Tx, ids: string[]): Promise<LockedWorker[]> {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<LockedWorker[]>`
    SELECT id, status::text AS status, approved
    FROM "WorkerProfile"
    WHERE id = ANY(${sorted}::text[])
    ORDER BY id
    FOR UPDATE`;
  if (rows.length !== sorted.length) throw notFound("Worker");
  return rows;
}

export function assertAllAvailable(workers: LockedWorker[]): void {
  if (workers.some((w) => w.status !== "available" || !w.approved)) {
    throw conflict("WORKER_NOT_AVAILABLE", "This worker is not available right now.");
  }
}

export async function setStatus(
  tx: Tx,
  fx: Effects,
  workerIds: string[],
  status: WorkerStatus,
  offlineUntil: Date | null = null,
): Promise<void> {
  if (!workerIds.length) return;
  await tx.workerProfile.updateMany({
    where: { id: { in: workerIds } },
    data: { status, offlineUntil, statusChangedAt: new Date() },
  });
  for (const id of workerIds) fx.status(id, status, offlineUntil);
}

/** Frees the job's workers and ends their assignments. `except` keeps a worker out of `available`. */
export async function releaseWorkers(tx: Tx, fx: Effects, job: JobFull, except?: string): Promise<void> {
  const active = job.assignments.filter((a) => a.active).map((a) => a.workerId);
  await tx.jobAssignment.updateMany({ where: { jobId: job.id, active: true }, data: { active: false } });
  await setStatus(
    tx,
    fx,
    active.filter((id) => id !== except),
    "available",
  );
}
