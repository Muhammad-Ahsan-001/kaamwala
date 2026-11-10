import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authOf, normalizePhone, requireAuth } from "../auth";
import { prisma } from "../db";
import { forbidden, notFound, unprocessable } from "../errors";
import { getActiveCategories } from "../jev";
import { crewInclude, toCrews } from "../serialize";

const CreateCrew = z.object({
  name: z.string().trim().min(2).max(80),
  categoryIds: z.array(z.string()).min(1).max(5),
  rate: z.number().int().positive(),
  memberIds: z.array(z.string()).max(19).default([]),
});

const AddMember = z.object({ workerId: z.string().optional(), phone: z.string().optional() }).refine(
  (b) => b.workerId || b.phone,
  { message: "Give a workerId or a phone number." },
);

async function oneCrew(id: string) {
  const crew = await prisma.crew.findUnique({ where: { id }, include: crewInclude });
  if (!crew) throw notFound("Crew");
  const [dto] = await toCrews([crew]);
  return dto;
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

  app.get("/crews/:id", async (req) => oneCrew(z.object({ id: z.string() }).parse(req.params).id));

  app.post("/crews", { preHandler: requireAuth }, async (req, reply) => {
    const { worker } = authOf(req);
    if (!worker) throw forbidden("Finish worker sign-up first.");
    const body = CreateCrew.parse(req.body);

    const allowed = new Set(getActiveCategories().filter((c) => c.crewAllowed).map((c) => c.id));
    if (body.categoryIds.some((id) => !allowed.has(id))) {
      throw unprocessable("CREW_NOT_ALLOWED", "Crew jobs are not allowed in one of these trades.");
    }

    const memberIds = [...new Set([worker.id, ...body.memberIds])];
    const found = await prisma.workerProfile.count({ where: { id: { in: memberIds } } });
    if (found !== memberIds.length) throw notFound("Worker");

    const crew = await prisma.crew.create({
      data: {
        name: body.name,
        leaderId: worker.id,
        categoryIds: body.categoryIds,
        rate: body.rate,
        members: { create: memberIds.map((workerId) => ({ workerId })) },
      },
    });
    return reply.code(201).send(await oneCrew(crew.id));
  });

  app.post("/crews/:id/members", { preHandler: requireAuth }, async (req) => {
    const { worker } = authOf(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = AddMember.parse(req.body);
    const crew = await prisma.crew.findUnique({ where: { id } });
    if (!crew) throw notFound("Crew");
    if (!worker || crew.leaderId !== worker.id) throw forbidden("Only the crew leader can add members.");

    const member = body.workerId
      ? await prisma.workerProfile.findUnique({ where: { id: body.workerId } })
      : await prisma.workerProfile.findFirst({ where: { user: { phone: normalizePhone(body.phone as string) } } });
    if (!member) throw notFound("Worker");

    await prisma.crewMember.upsert({
      where: { crewId_workerId: { crewId: id, workerId: member.id } },
      create: { crewId: id, workerId: member.id },
      update: {},
    });
    return oneCrew(id);
  });
}
