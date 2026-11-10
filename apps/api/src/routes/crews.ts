import type { CrewInvite } from "@kaamwala/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authOf, normalizePhone, requireAuth } from "../auth";
import { prisma } from "../db";
import { lockCrew, runTx } from "../domain/tx";
import { env } from "../env";
import { conflict, forbidden, notFound, unprocessable } from "../errors";
import { hub } from "../hub";
import { getActiveCategories } from "../jev";
import { perUserLimit } from "../limits";
import { pushToUsers } from "../push";
import { crewInclude, toCrews } from "../serialize";

const MAX_CREW_SIZE = 20;

const CreateCrew = z.object({
  name: z.string().trim().min(2).max(80),
  categoryIds: z.array(z.string()).min(1).max(5),
  rate: z.number().int().positive(),
  memberIds: z.array(z.string()).max(MAX_CREW_SIZE - 1).default([]),
});

const AddMember = z.object({ workerId: z.string().optional(), phone: z.string().optional() }).refine(
  (b) => b.workerId || b.phone,
  { message: "Give a workerId or a phone number." },
);

const Id = z.object({ id: z.string() });

const inviteLimit = perUserLimit(env.RATE_LIMIT_CREWS_PER_MIN);

async function oneCrew(id: string) {
  const crew = await prisma.crew.findUnique({ where: { id }, include: crewInclude });
  if (!crew) throw notFound("Crew");
  const [dto] = await toCrews([crew]);
  return dto;
}

function notifyInvited(userIds: string[], crew: { id: string; name: string }): void {
  hub.toUsersOnly(userIds, { type: "crew.invited", crewId: crew.id });
  void pushToUsers(userIds, {
    title: "ٹیم میں شامل ہونے کی دعوت",
    body: crew.name,
    url: `/app/crews/${crew.id}`,
    tag: `${crew.id}-invite`,
  }).catch(() => undefined);
}

/** Someone joined, said no or left. The crew's open screens refresh and the leader, who is not watching, is told. */
async function tellCrew(crewId: string, title: string, who: string | null): Promise<void> {
  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    select: { name: true, leader: { select: { userId: true } }, members: { where: { status: "accepted" }, select: { worker: { select: { userId: true } } } } },
  });
  if (!crew) return;
  hub.toUsersOnly([crew.leader.userId, ...crew.members.map((m) => m.worker.userId)], { type: "crew.updated", crewId });
  void pushToUsers([crew.leader.userId], {
    title,
    body: who ? `${who}: ${crew.name}` : crew.name,
    url: `/app/crews/${crewId}`,
    tag: `${crewId}-members`,
  }).catch(() => undefined);
}

export async function crewRoutes(app: FastifyInstance) {
  app.get("/crews", async (req) => {
    const { categoryId } = z.object({ categoryId: z.string().optional() }).parse(req.query);
    const crews = await prisma.crew.findMany({
      where: categoryId ? { categoryIds: { has: categoryId } } : {},
      include: crewInclude,
      orderBy: { createdAt: "asc" },
    });
    return { items: await toCrews(crews) };
  });

  /** Invitations waiting for the signed-in worker's answer. */
  app.get("/crews/invites", { preHandler: requireAuth }, async (req) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const rows = await prisma.crewMember.findMany({
      where: { workerId: worker.id, status: "invited" },
      include: { crew: { include: { leader: { include: { user: { select: { name: true } } } } } } },
      orderBy: { invitedAt: "desc" },
    });
    const items: CrewInvite[] = rows.map((r) => ({
      crewId: r.crewId,
      crewName: r.crew.name,
      leaderName: r.crew.leader.user.name ?? "",
      categoryIds: r.crew.categoryIds,
      rate: r.crew.rate,
      invitedAt: r.invitedAt.toISOString(),
    }));
    return { items };
  });

  app.get("/crews/:id", async (req) => oneCrew(Id.parse(req.params).id));

  app.post("/crews", { preHandler: requireAuth, config: inviteLimit }, async (req, reply) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const body = CreateCrew.parse(req.body);

    const allowed = new Set(getActiveCategories().filter((c) => c.crewAllowed).map((c) => c.id));
    if (body.categoryIds.some((id) => !allowed.has(id))) {
      throw unprocessable("CREW_NOT_ALLOWED", "Crew jobs are not allowed in one of these trades.");
    }

    const invitedIds = [...new Set(body.memberIds)].filter((id) => id !== worker.id);
    const invited = await prisma.workerProfile.findMany({ where: { id: { in: invitedIds } }, select: { userId: true } });
    if (invited.length !== invitedIds.length) throw notFound("Worker");

    const crew = await prisma.crew.create({
      data: {
        name: body.name,
        leaderId: worker.id,
        categoryIds: body.categoryIds,
        rate: body.rate,
        members: {
          create: [
            { workerId: worker.id, status: "accepted" },
            ...invitedIds.map((workerId) => ({ workerId, status: "invited" as const })),
          ],
        },
      },
    });
    notifyInvited(invited.map((w) => w.userId), crew);
    return reply.code(201).send(await oneCrew(crew.id));
  });

  app.post("/crews/:id/members", { preHandler: requireAuth, config: inviteLimit }, async (req) => {
    const { worker } = authOf(req);
    const { id } = Id.parse(req.params);
    const body = AddMember.parse(req.body);
    const crew = await prisma.crew.findUnique({ where: { id } });
    if (!crew) throw notFound("Crew");
    if (!worker || crew.leaderId !== worker.id) throw forbidden("Only the crew leader can add members.");

    const member = body.workerId
      ? await prisma.workerProfile.findUnique({ where: { id: body.workerId } })
      : await prisma.workerProfile.findFirst({ where: { user: { phone: normalizePhone(body.phone as string) } } });
    // Worker ids are public, so an unknown one is safe to report. A phone number is not:
    // the reply must not reveal whether that person has a profile here.
    if (!member && body.workerId) throw notFound("Worker");
    if (!member) return oneCrew(id);

    const size = await prisma.crewMember.count({ where: { crewId: id } });
    if (size >= MAX_CREW_SIZE) throw unprocessable("CREW_FULL", `A crew can have ${MAX_CREW_SIZE} people.`);

    const existing = await prisma.crewMember.findUnique({
      where: { crewId_workerId: { crewId: id, workerId: member.id } },
    });
    if (!existing) {
      await prisma.crewMember.create({ data: { crewId: id, workerId: member.id, status: "invited" } });
      notifyInvited([member.userId], crew);
    }
    return oneCrew(id);
  });

  app.post("/crews/:id/accept", { preHandler: requireAuth }, async (req) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const { id } = Id.parse(req.params);
    await runTx(async (tx) => {
      await lockCrew(tx, id);
      const updated = await tx.crewMember.updateMany({
        where: { crewId: id, workerId: worker.id, status: "invited" },
        data: { status: "accepted" },
      });
      if (updated.count === 0) throw notFound("Invitation");
    });
    await tellCrew(id, "ٹیم میں نیا ساتھی شامل ہوا", authOf(req).user.name);
    return oneCrew(id);
  });

  app.post("/crews/:id/decline", { preHandler: requireAuth }, async (req) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const { id } = Id.parse(req.params);
    const removed = await prisma.crewMember.deleteMany({
      where: { crewId: id, workerId: worker.id, status: "invited" },
    });
    if (removed.count === 0) throw notFound("Invitation");
    await tellCrew(id, "دعوت قبول نہیں ہوئی", authOf(req).user.name);
    return { ok: true };
  });

  app.post("/crews/:id/leave", { preHandler: requireAuth }, async (req) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const { id } = Id.parse(req.params);
    await runTx(async (tx) => {
      const crew = await lockCrew(tx, id);
      if (crew.leaderId === worker.id) throw unprocessable("LEADER_CANNOT_LEAVE", "The crew leader cannot leave the crew.");
      const onJob = await tx.jobAssignment.count({ where: { workerId: worker.id, active: true, job: { crewId: id } } });
      if (onJob > 0) throw conflict("CREW_JOB_ACTIVE", "Finish this crew's current job first.");
      const removed = await tx.crewMember.deleteMany({ where: { crewId: id, workerId: worker.id } });
      if (removed.count === 0) throw notFound("Membership");
    });
    await tellCrew(id, "ساتھی نے ٹیم چھوڑ دی", authOf(req).user.name);
    return { ok: true };
  });
}
