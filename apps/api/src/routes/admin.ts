import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { JobStatus, type AgentLedgerEntry, type AgentLedgerSummary } from "@kaamwala/contracts";
import { normalizePhone, requireRole } from "../auth";
import { prisma } from "../db";
import { suspendWorker } from "../domain/jobs";
import { lockJob, lockWorkers, runTx, setStatus } from "../domain/tx";
import { conflict, notFound } from "../errors";
import { startOfDayPkt } from "../geo";
import { CLOSE_SUSPENDED, hub } from "../hub";
import { jobInclude, toJob, workerCards } from "../serialize";

const Id = z.object({ id: z.string() });

const daysBack = (days: number, now: Date) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/** Every authorised agent, including those with no signups yet. */
async function agentSummaries(since?: Date, agentId?: string): Promise<AgentLedgerSummary[]> {
  const agents = await prisma.user.findMany({
    where: { role: "agent", ...(agentId ? { id: agentId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const totals = await prisma.agentLedgerEntry.groupBy({
    by: ["agentId"],
    where: { agentId: { in: agents.map((a) => a.id) }, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
    _sum: { fee: true, agentShare: true, platformShare: true },
  });
  const byAgent = new Map(totals.map((t) => [t.agentId, t]));
  return agents.map((a) => {
    const t = byAgent.get(a.id);
    return {
      agentId: a.id,
      agentName: a.name ?? "",
      phone: a.phone,
      signups: t?._count._all ?? 0,
      totalFee: t?._sum.fee ?? 0,
      agentShare: t?._sum.agentShare ?? 0,
      platformShare: t?._sum.platformShare ?? 0,
    };
  });
}

export async function adminRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole("admin") };

  app.get("/admin/workers", admin, async () => {
    const rows = await prisma.workerProfile.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } });
    const cards = await workerCards(rows);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      items: cards.map((c) => ({
        ...c,
        phone: byId.get(c.id)?.user.phone ?? null,
        suspended: byId.get(c.id)?.user.suspended ?? false,
      })),
    };
  });

  app.post("/admin/workers/:id/approve", admin, async (req) => {
    const { id } = Id.parse(req.params);
    await runTx(async (tx, fx) => {
      const worker = await tx.workerProfile.findUnique({ where: { id } });
      if (!worker) throw notFound("Worker");
      const [locked] = await lockWorkers(tx, [id]);
      await tx.workerProfile.update({ where: { id }, data: { approved: true } });
      await tx.user.update({ where: { id: worker.userId }, data: { suspended: false } });
      if (locked?.status === "offline") await setStatus(tx, fx, [id], "available");
    });
    return { ok: true };
  });

  app.post("/admin/workers/:id/suspend", admin, async (req) => {
    const { id } = Id.parse(req.params);
    const { userId, endedJobId } = await suspendWorker(id);
    hub.disconnectUser(userId, CLOSE_SUSPENDED, "suspended");
    return { ok: true, endedJobId };
  });

  app.get("/admin/jobs", admin, async (req) => {
    const { status } = z.object({ status: JobStatus.optional() }).parse(req.query);
    const rows = await prisma.job.findMany({
      where: status ? { status } : {},
      include: jobInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { items: rows.map(toJob) };
  });

  app.get("/admin/disputes", admin, async () => {
    const rows = await prisma.job.findMany({
      where: { OR: [{ status: "disputed" }, { disputeReason: { not: null } }] },
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: rows.map((j) => ({ ...toJob(j), disputeReason: j.disputeReason, disputeResolution: j.disputeResolution })),
    };
  });

  app.post("/admin/disputes/:id/resolve", admin, async (req) => {
    const { id } = Id.parse(req.params);
    const { resolution } = z.object({ resolution: z.string().trim().min(3).max(1000) }).parse(req.body);
    const job = await runTx(async (tx, fx) => {
      const locked = await lockJob(tx, id);
      if (locked.status !== "disputed") throw conflict("INVALID_JOB_STATE", "This job is not in dispute.");
      // Days already worked were paid, so a job with any of them finished, however it ended.
      const worked = locked.days.filter((d) => d.status === "completed");
      const finishedDuringDispute = !locked.completedAt && worked.length > 0;
      const lastWorked = worked.reduce<Date | null>(
        (latest, d) => (d.completedAt && (!latest || d.completedAt > latest) ? d.completedAt : latest),
        null,
      );
      const updated = await tx.job.update({
        where: { id },
        data: {
          disputeResolution: resolution,
          status: locked.completedAt || worked.length > 0 ? "completed" : "cancelled",
          ...(finishedDuringDispute ? { completedAt: lastWorked ?? new Date() } : {}),
        },
        include: jobInclude,
      });
      fx.job(id);
      return updated;
    });
    return toJob(job);
  });

  app.get("/admin/stats", admin, async () => {
    const now = new Date();
    const [workers, jobs, customers, categories, availableNow, engagedNow, jobsToday, fees] = await Promise.all([
      prisma.workerProfile.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.category.count({ where: { active: true } }),
      prisma.workerProfile.count({ where: { status: "available", approved: true, user: { suspended: false } } }),
      prisma.workerProfile.count({ where: { status: "engaged" } }),
      prisma.job.count({ where: { createdAt: { gte: startOfDayPkt(now) } } }),
      prisma.agentLedgerEntry.aggregate({ where: { createdAt: { gte: daysBack(7, now) } }, _sum: { fee: true } }),
    ]);
    const toRecord = <T extends string>(rows: { status: T; _count: { _all: number } }[]) =>
      Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    return {
      availableNow,
      engagedNow,
      jobsToday,
      agentFeesWeek: fees._sum.fee ?? 0,
      workersByStatus: toRecord(workers),
      jobsByStatus: toRecord(jobs),
      customers,
      activeCategories: categories,
    };
  });

  app.get("/admin/agents", admin, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().positive().max(3650).optional() }).parse(req.query);
    return { items: await agentSummaries(days ? daysBack(days, new Date()) : undefined) };
  });

  app.get("/admin/agents/:id/ledger", admin, async (req) => {
    const { id } = Id.parse(req.params);
    const [summary] = await agentSummaries(undefined, id);
    if (!summary) throw notFound("Agent");
    const rows = await prisma.agentLedgerEntry.findMany({
      where: { agentId: id },
      include: { worker: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const entries: AgentLedgerEntry[] = rows.map((e) => ({
      id: e.id,
      agentId: e.agentId,
      agentName: summary.agentName,
      workerId: e.workerId,
      workerName: e.worker.user.name ?? "",
      fee: e.fee,
      agentShare: e.agentShare,
      platformShare: e.platformShare,
      paymentStatus: e.paymentStatus,
      createdAt: e.createdAt.toISOString(),
    }));
    return { summary, entries };
  });

  app.post("/admin/agents", admin, async (req, reply) => {
    const body = z.object({ phone: z.string(), name: z.string().trim().min(2).max(80) }).parse(req.body);
    const phone = normalizePhone(body.phone);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing?.role === "admin") throw conflict("PHONE_IN_USE", "This phone belongs to an admin.");
    const user = await prisma.user.upsert({
      where: { phone },
      create: { phone, name: body.name, role: "agent" },
      update: { name: body.name, role: "agent", suspended: false },
    });
    return reply.code(201).send({ id: user.id, name: user.name, phone: user.phone });
  });
}
