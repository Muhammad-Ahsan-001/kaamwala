import type { FastifyRequest } from "fastify";

/**
 * Route config for a limit counted per account. It runs after sign-in is checked, so the many
 * people who share one mobile-network address do not share one limit.
 */
export const perUserLimit = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: "1 minute",
    hook: "preHandler" as const,
    keyGenerator: (req: FastifyRequest) => req.auth?.user.id ?? req.ip,
  },
});
