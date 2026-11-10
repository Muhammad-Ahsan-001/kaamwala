import type { WorkerStatus } from "@kaamwala/contracts";
import type { Role, WorkerProfile } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { distanceKm } from "../geo";
import { feedTrades } from "./feedTrades";

/** The one rule for who may see an open job: the feed, a lookup by id, the socket and pushes all use it. */
export interface OpenJobScope {
  mode: "direct" | "open" | "crew";
  categoryId: string;
  lat: number;
  lng: number;
}

export const withinOpenJobRadius = (job: OpenJobScope, point: { lat: number; lng: number }) =>
  distanceKm({ lat: job.lat, lng: job.lng }, point) <= env.OPEN_JOB_RADIUS_KM;

/** Whether this worker is someone this open job is meant for. */
export async function workerMatchesOpenJob(worker: WorkerProfile, job: OpenJobScope): Promise<boolean> {
  if (!worker.approved || !withinOpenJobRadius(job, worker)) return false;
  if (job.mode !== "crew") return feedTrades(worker).includes(job.categoryId);
  const crews = await prisma.crew.count({ where: { leaderId: worker.id, categoryIds: { has: job.categoryId } } });
  return crews > 0;
}

export interface OpenJobRecipient {
  userId: string;
  role: Role;
  /** Free right now, and for a crew job every accepted member is free too. */
  ready: boolean;
}

const candidate = {
  userId: true,
  lat: true,
  lng: true,
  status: true,
  approved: true,
  user: { select: { role: true, suspended: true } },
} as const;

/** Everyone the job reaches. A crew job reaches the leaders of crews that do this trade. */
export async function openJobRecipients(job: OpenJobScope): Promise<OpenJobRecipient[]> {
  const eligible = (w: { approved: boolean; lat: number; lng: number; user: { suspended: boolean } }) =>
    w.approved && !w.user.suspended && withinOpenJobRadius(job, w);
  const free = (status: WorkerStatus, approved: boolean) => status === "available" && approved;

  if (job.mode !== "crew") {
    const workers = await prisma.workerProfile.findMany({
      // Everyone who might want this trade. feedTrades makes the actual decision.
      where: { OR: [{ categoryIds: { has: job.categoryId } }, { feedCategoryIds: { has: job.categoryId } }] },
      select: { ...candidate, categoryIds: true, feedCategoryIds: true },
    });
    return workers
      .filter((w) => eligible(w) && feedTrades(w).includes(job.categoryId))
      .map((w) => ({ userId: w.userId, role: w.user.role, ready: free(w.status, w.approved) }));
  }

  const crews = await prisma.crew.findMany({
    where: { categoryIds: { has: job.categoryId } },
    select: {
      leader: { select: candidate },
      members: { where: { status: "accepted" }, select: { worker: { select: { status: true, approved: true } } } },
    },
  });
  const byUser = new Map<string, OpenJobRecipient>();
  for (const crew of crews) {
    if (!eligible(crew.leader)) continue;
    const ready = crew.members.length > 0 && crew.members.every((m) => free(m.worker.status, m.worker.approved));
    const seen = byUser.get(crew.leader.userId);
    byUser.set(crew.leader.userId, {
      userId: crew.leader.userId,
      role: crew.leader.user.role,
      ready: ready || (seen?.ready ?? false),
    });
  }
  return [...byUser.values()];
}
