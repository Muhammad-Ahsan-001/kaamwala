import type { WorkerStatus } from "@kaamwala/contracts";
import { prisma } from "../db";
import { env } from "../env";
import { hub } from "../hub";
import { cancelInTx } from "./jobs";
import { lockJob, runTx } from "./tx";

const SWEEP_MS = 5_000;
let timer: NodeJS.Timeout | null = null;

/** Each worker moves in one atomic UPDATE, so this cannot race a booking transaction. */
export async function sweepStatuses(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: string; status: WorkerStatus }[]>`
    UPDATE "WorkerProfile"
    SET status = 'available', "offlineUntil" = NULL, "statusChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE approved
      AND (
        (status = 'offline' AND "offlineUntil" IS NOT NULL AND "offlineUntil" <= NOW())
        OR (status = 'completed' AND "statusChangedAt" <= NOW() - INTERVAL '5 seconds')
      )
    RETURNING id, status::text AS status`;
  for (const row of rows) {
    hub.broadcast({ type: "worker.status", workerId: row.id, status: row.status, offlineUntil: null });
  }
  return rows.length;
}

const MINUTE_MS = 60_000;
const EXPIRY_BATCH = 50;

/** Decides inside the lock whether the job is still stale, so a late accept always wins. */
async function expireJob(id: string, requestCutoff: Date, idleCutoff: Date): Promise<boolean> {
  return runTx(async (tx, fx) => {
    const job = await lockJob(tx, id);
    const stale =
      job.status === "requested"
        ? job.updatedAt < requestCutoff
        : (job.status === "negotiating" || job.status === "pending_confirmation") && job.updatedAt < idleCutoff;
    if (!stale) return false;
    if (job.status !== "requested") {
      const recent = await tx.message.count({ where: { jobId: id, createdAt: { gte: idleCutoff } } });
      if (recent > 0) return false;
    }
    await cancelInTx(tx, fx, job);
    fx.push([job.customerId], { title: "درخواست ختم ہو گئی", body: "کوئی جواب نہیں آیا", url: `/app/jobs/${id}`, tag: id });
    return true;
  });
}

/** Without this an abandoned request would hold its workers out of search with no time limit. */
export async function expireStaleJobs(now: Date = new Date()): Promise<number> {
  const requestCutoff = new Date(now.getTime() - env.REQUEST_EXPIRY_MINUTES * MINUTE_MS);
  const idleCutoff = new Date(now.getTime() - env.NEGOTIATION_EXPIRY_MINUTES * MINUTE_MS);
  const stale = await prisma.job.findMany({
    where: {
      OR: [
        { status: "requested", updatedAt: { lt: requestCutoff } },
        {
          status: { in: ["negotiating", "pending_confirmation"] },
          updatedAt: { lt: idleCutoff },
          messages: { none: { createdAt: { gte: idleCutoff } } },
        },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: EXPIRY_BATCH,
  });
  let expired = 0;
  for (const { id } of stale) {
    try {
      if (await expireJob(id, requestCutoff, idleCutoff)) expired++;
    } catch (err) {
      console.error("expiring a job failed", err);
    }
  }
  return expired;
}

let expiring = false;

async function sweepOnce(): Promise<void> {
  await sweepStatuses();
  if (expiring) return;
  expiring = true;
  try {
    await expireStaleJobs();
  } finally {
    expiring = false;
  }
}

export function startSweep(): void {
  timer ??= setInterval(() => {
    sweepOnce().catch((err) => console.error("status sweep failed", err));
  }, SWEEP_MS);
  timer.unref();
}

export function stopSweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
