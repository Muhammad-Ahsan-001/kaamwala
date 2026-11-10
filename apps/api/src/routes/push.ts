import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authOf, requireAuth } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { pushEnabled } from "../push";

const Subscribe = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function pushRoutes(app: FastifyInstance) {
  app.get("/push/public-key", async () => ({
    enabled: pushEnabled,
    publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null,
  }));

  app.post("/push/subscribe", { preHandler: requireAuth }, async (req, reply) => {
    const { user } = authOf(req);
    const body = Subscribe.parse(req.body);
    const data = { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth };
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { endpoint: body.endpoint, ...data },
      update: data,
    });
    return reply.code(201).send({ ok: true });
  });

  /** Only the owner can remove a subscription, so a guessed endpoint does nothing. */
  app.post("/push/unsubscribe", { preHandler: requireAuth }, async (req) => {
    const { user } = authOf(req);
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return { ok: true };
  });
}
