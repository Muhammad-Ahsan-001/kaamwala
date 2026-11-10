import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findArea } from "../areas";
import { authOf, requireAuth } from "../auth";
import { prisma } from "../db";
import { notFound } from "../errors";
import { hirerCard, reviewInclude, toReviewView } from "../serialize";
import { isOwnImageUrl } from "../uploads";

const Fields = {
  name: z.string().trim().min(2).max(80),
  area: z.string().trim().max(120).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  address: z.string().trim().max(200).optional(),
  photoUrl: z.string().url().refine(isOwnImageUrl, { message: "Upload the photo first." }).optional(),
};
const CustomerBody = z.object(Fields);
const CustomerPatch = CustomerBody.partial();

/** Only what was sent changes, so editing one field never wipes another. */
function profileData(body: z.infer<typeof CustomerPatch>) {
  const known = body.area ? findArea(body.area) : null;
  const point = body.location ?? known;
  return {
    ...(body.area !== undefined ? { area: known?.name ?? (body.area || null) } : {}),
    ...(point ? { lat: point.lat, lng: point.lng } : {}),
    ...(body.address !== undefined ? { address: body.address || null } : {}),
    ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
  };
}

export async function customerRoutes(app: FastifyInstance) {
  /** Typed customer sign-up. Safe to call again to edit the profile. */
  app.post("/customers", { preHandler: requireAuth }, async (req, reply) => {
    const { user } = authOf(req);
    const body = CustomerBody.parse(req.body);
    const data = profileData(body);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { name: body.name } }),
      prisma.hirerProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
    ]);
    return reply.code(201).send(await hirerCard(user.id, { own: true }));
  });

  app.patch("/customers/me", { preHandler: requireAuth }, async (req) => {
    const { user } = authOf(req);
    const body = CustomerPatch.parse(req.body);
    const data = profileData(body);
    await prisma.$transaction([
      ...(body.name ? [prisma.user.update({ where: { id: user.id }, data: { name: body.name } })] : []),
      prisma.hirerProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
    ]);
    return hirerCard(user.id, { own: true });
  });

  app.get("/customers/:id", { preHandler: requireAuth }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const { user } = authOf(req);
    const id = params.id === "me" ? user.id : params.id;
    const card = await hirerCard(id, { own: id === user.id });
    if (!card) throw notFound("Customer");
    const reviews = await prisma.review.findMany({
      where: { direction: "worker_to_customer", revieweeId: id },
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { ...card, reviews: reviews.map(toReviewView) };
  });
}
