import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findArea } from "../areas";
import { authOf, requireAuth } from "../auth";
import { prisma } from "../db";
import { notFound } from "../errors";
import { hirerCard } from "../serialize";

const CustomerBody = z.object({
  name: z.string().trim().min(2).max(80),
  area: z.string().trim().max(120).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  photoUrl: z.string().url().optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  /** Typed customer sign-up. Safe to call again to edit the profile. */
  app.post("/customers", { preHandler: requireAuth }, async (req, reply) => {
    const { user } = authOf(req);
    const body = CustomerBody.parse(req.body);
    const known = body.area ? findArea(body.area) : null;
    const point = body.location ?? known;
    const data = {
      area: known?.name ?? body.area ?? null,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      photoUrl: body.photoUrl ?? null,
    };
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { name: body.name } }),
      prisma.hirerProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
    ]);
    return reply.code(201).send(await hirerCard(user.id));
  });

  app.get("/customers/:id", { preHandler: requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const card = await hirerCard(id);
    if (!card) throw notFound("Customer");
    return card;
  });
}
