import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth";
import { readSettings, toSettings, updateSettings } from "../domain/settings";

const SettingsPatch = z
  .object({
    agentSignupFee: z.number().int().nonnegative().max(1_000_000).optional(),
    agentSharePercent: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings/public", async () => toSettings(await readSettings()));

  const admin = { preHandler: requireRole("admin") };

  app.get("/admin/settings", admin, async () => toSettings(await readSettings()));

  /** Applies to new signups only. Existing ledger entries keep the amounts they were recorded with. */
  app.patch("/admin/settings", admin, async (req) => toSettings(await updateSettings(SettingsPatch.parse(req.body))));
}
