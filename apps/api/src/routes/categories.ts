import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole, verifyToken } from "../auth";
import { prisma } from "../db";
import { forbidden, notFound } from "../errors";
import { hub } from "../hub";
import { getActiveCategories, jev, reloadCategories } from "../jev";
import { toCategory } from "../serialize";

const words = z.array(z.string().trim().min(1).max(80)).max(300);

const CategoryBody = z.object({
  nameUr: z.string().trim().min(1).max(80),
  nameRoman: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40),
  keywords: words.default([]),
  skills: words.default([]),
  skillAliases: z.record(z.array(z.string())).default({}),
  floorPrice: z.number().int().nonnegative(),
  step: z.number().int().positive().default(50),
  crewAllowed: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

const CategoryPatch = z.object({
  nameUr: z.string().trim().min(1).max(80).optional(),
  nameRoman: z.string().trim().min(1).max(80).optional(),
  nameEn: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().min(1).max(40).optional(),
  keywords: words.optional(),
  skills: words.optional(),
  skillAliases: z.record(z.array(z.string())).optional(),
  floorPrice: z.number().int().nonnegative().optional(),
  step: z.number().int().positive().optional(),
  crewAllowed: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Takes effect at once: Jev is rebuilt and every open app is told to refetch. */
async function categoriesChanged() {
  await reloadCategories();
  hub.broadcast({ type: "categories.changed" });
}

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/categories", async (req) => {
    const { all } = z.object({ all: z.string().optional() }).parse(req.query);
    if (all === "1") {
      const header = req.headers.authorization;
      const claims = header?.startsWith("Bearer ") ? await verifyToken(header.slice(7)) : null;
      if (claims?.role !== "admin") throw forbidden();
    }
    const rows = await prisma.category.findMany({
      where: all === "1" ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { items: rows.map(toCategory) };
  });

  /** Jev only, so it costs no model call and is safe to run as someone types. */
  app.get("/categories/match", { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } }, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(300) }).parse(req.query);
    const best = jev.match(q).best;
    const category = best ? getActiveCategories().find((c) => c.id === best.categoryId) : undefined;
    return {
      category: category ? toCategory(category) : null,
      confidence: category && best ? best.confidence : 0,
      skills: category && best ? best.skills.map((s) => s.skill) : [],
    };
  });

  const admin = { preHandler: requireRole("admin") };

  app.post("/admin/categories", admin, async (req, reply) => {
    const body = CategoryBody.parse(req.body);
    const last = await prisma.category.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.category.create({
      data: { ...body, sortOrder: body.sortOrder ?? (last._max.sortOrder ?? 0) + 1 },
    });
    await categoriesChanged();
    return reply.code(201).send(toCategory(row));
  });

  app.patch("/admin/categories/:id", admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = CategoryPatch.parse(req.body);
    if (!(await prisma.category.count({ where: { id } }))) throw notFound("Category");
    const row = await prisma.category.update({ where: { id }, data: body });
    await categoriesChanged();
    return toCategory(row);
  });

  app.post("/admin/categories/reorder", admin, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$transaction(ids.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i } })));
    await categoriesChanged();
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    return { items: rows.map(toCategory) };
  });
}
