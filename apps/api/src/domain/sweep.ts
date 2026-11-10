import type { WorkerStatus } from "@kaamwala/contracts";
import { prisma } from "../db";
import { hub } from "../hub";

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

export function startSweep(): void {
  timer ??= setInterval(() => {
    sweepStatuses().catch((err) => console.error("status sweep failed", err));
  }, SWEEP_MS);
  timer.unref();
}

export function stopSweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
