import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Role } from "@kaamwala/contracts";
import { authOf, normalizePhone, requireAuth, signToken } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { AppError, suspended, unauthorized } from "../errors";
import { hirerCard, toAuthUser, workerSelf } from "../serialize";

const OTP_TTL_MS = 5 * 60 * 1000;
const authLimit = { rateLimit: { max: env.RATE_LIMIT_AUTH_PER_MIN, timeWindow: "1 minute" } };

const RequestBody = z.object({ phone: z.string().min(10).max(20) });
const VerifyBody = z.object({
  phone: z.string().min(10).max(20),
  otp: z.string().min(4).max(8),
  role: Role.optional(),
});

async function authUserFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { workerProfile: { select: { id: true } }, hirerProfile: { select: { id: true } } },
  });
  return toAuthUser(user, user.workerProfile?.id ?? null, Boolean(user.hirerProfile));
}

export async function authRoutes(app: FastifyInstance) {
  /** Mocked delivery: the code comes back in the response and is shown on screen. Disclosed in the README. */
  app.post("/auth/otp/request", { config: authLimit }, async (req) => {
    const { phone: raw } = RequestBody.parse(req.body);
    const phone = normalizePhone(raw);
    const code = String(randomInt(100000, 1000000));
    await prisma.otpChallenge.create({ data: { phone, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    return { devOtp: code, mocked: true };
  });

  app.post("/auth/otp/verify", { config: authLimit }, async (req) => {
    const body = VerifyBody.parse(req.body);
    const phone = normalizePhone(body.phone);

    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.code !== body.otp) throw unauthorized("That code is wrong or has expired.");

    // updateMany on the unconsumed row means a code works exactly once, even if two requests race.
    const used = await prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (used.count !== 1) throw unauthorized("That code is wrong or has expired.");

    // Staff roles are only ever granted by an admin or the seed.
    const wanted = body.role === "worker" || body.role === "customer" ? body.role : undefined;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing?.suspended) throw suspended();
    // The admin and agent doors never create or convert an account, so a stranger cannot end up with one there.
    if ((body.role === "admin" || body.role === "agent") && existing?.role !== body.role) {
      throw new AppError(403, "NOT_STAFF", "This number is not approved for this sign-in.");
    }

    let user = existing;
    if (!user) {
      user = await prisma.user.create({ data: { phone, role: wanted ?? "customer" } });
    } else if (wanted && user.role !== wanted && (user.role === "worker" || user.role === "customer")) {
      // One phone can be both a worker and a customer; the role follows the latest sign-in.
      user = await prisma.user.update({ where: { id: user.id }, data: { role: wanted } });
    }
    if (!user.phoneVerifiedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    }

    return { token: await signToken(user.id, user.role), user: await authUserFor(user.id) };
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const { user, worker } = authOf(req);
    const [authUser, workerDto, hirer] = await Promise.all([
      authUserFor(user.id),
      worker ? workerSelf(worker.id) : null,
      prisma.hirerProfile.count({ where: { userId: user.id } }).then((n) => (n ? hirerCard(user.id, { own: true }) : null)),
    ]);
    return { user: authUser, worker: workerDto, hirer };
  });
}
