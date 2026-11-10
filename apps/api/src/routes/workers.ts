import { OfflinePreset } from "@kaamwala/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authOf, requireAuth, requireRole } from "../auth";
import { prisma } from "../db";
import {
  cleanCnic,
  createWorker,
  listAreas,
  registerCnic,
  searchWorkers,
  setAvailability,
  updateWorker,
} from "../domain/workers";
import { env } from "../env";
import { aiUnavailable, badRequest, forbidden, notFound, unprocessable } from "../errors";
import { GeminiUnavailable, readCnic, skillsFromPhoto } from "../gemini";
import { addDaysIso, startOfDayPkt, startOfWeekPkt, todayPkt } from "../geo";
import { getActiveCategories, jev } from "../jev";
import { findPlace, placeNear } from "../places";
import { reviewInclude, toEarning, toPastWork, toReviewView, workerCard } from "../serialize";
import { documentForAi, isOwnImageUrl, readBody, saveImage } from "../uploads";

const aiLimit = { rateLimit: { max: env.RATE_LIMIT_AI_PER_MIN, timeWindow: "1 minute" } };

const Location = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const WorkerFields = {
  name: z.string().trim().min(2).max(80),
  area: z.string().trim().min(1).max(120),
  categoryIds: z.array(z.string()).max(5).optional(),
  trade: z.string().trim().min(1).max(200).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  years: z.number().int().min(0).max(70).optional(),
  rate: z.number().int().min(0).max(1_000_000).optional(),
  location: Location.optional(),
  workingHours: z.string().trim().max(120).optional(),
  photoUrl: z.string().url().refine(isOwnImageUrl, { message: "Upload the photo first." }).optional(),
};

const CreateWorker = z.object({ ...WorkerFields, forPhone: z.string().optional(), cnic: z.string().max(20).optional() }).refine(
  (b) => b.categoryIds?.length || b.trade,
  { message: "Give a trade or choose categories." },
);
const UpdateWorker = z.object(WorkerFields).partial();

const num = z.coerce.number();
const SearchQuery = z.object({
  lat: num.min(-90).max(90).optional(),
  lng: num.min(-180).max(180).optional(),
  radiusKm: num.positive().max(100).optional(),
  categoryId: z.string().optional(),
  q: z.string().max(300).optional(),
  minRating: num.min(0).max(5).optional(),
});

/** Agents act on workers they registered via ?forWorkerId=. Everyone else acts on themselves. */
async function targetWorkerId(req: FastifyRequest): Promise<string> {
  const auth = authOf(req);
  const { forWorkerId } = z.object({ forWorkerId: z.string().optional() }).parse(req.query);
  if (forWorkerId) {
    if (auth.user.role !== "agent") throw forbidden();
    const count = await prisma.workerProfile.count({ where: { id: forWorkerId, createdByAgentId: auth.user.id } });
    if (!count) throw forbidden("You did not register this worker.");
    return forWorkerId;
  }
  if (!auth.worker) throw forbidden("Finish worker sign-up first.");
  return auth.worker.id;
}

export async function workerRoutes(app: FastifyInstance) {
  app.get("/areas", async () => ({ items: listAreas() }));

  app.get("/places/near", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const point = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.query);
    return { name: await placeNear(point) };
  });

  app.get("/places/find", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(req.query);
    return { place: await findPlace(q) };
  });

  app.get("/workers", async (req) => searchWorkers(SearchQuery.parse(req.query)));

  app.post("/workers", { preHandler: requireRole("worker", "agent") }, async (req, reply) => {
    const body = CreateWorker.parse(req.body);
    return reply.code(201).send(await createWorker(authOf(req), body));
  });

  app.patch("/workers/me", { preHandler: requireAuth }, async (req) => {
    const auth = authOf(req);
    if (!auth.worker) throw forbidden("Finish worker sign-up first.");
    return updateWorker(auth.worker, UpdateWorker.parse(req.body), auth.user.id);
  });

  app.post("/workers/me/availability", { preHandler: requireAuth }, async (req) => {
    const auth = authOf(req);
    if (!auth.worker) throw forbidden("Finish worker sign-up first.");
    const body = z.object({ available: z.boolean(), preset: OfflinePreset.optional() }).parse(req.body);
    return setAvailability(auth.worker.id, body);
  });

  app.post("/workers/me/photos", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const workerId = await targetWorkerId(req);
    const body = await readBody(req);
    if (!body.images.length) throw badRequest("IMAGE_REQUIRED", "Attach a photo.");
    const kind = body.fields.kind === "profile" ? "profile" : "work";
    const worker = await prisma.workerProfile.findUniqueOrThrow({ where: { id: workerId } });
    const categories = getActiveCategories().filter((c) => worker.categoryIds.includes(c.id));

    const urls: string[] = [];
    const found: string[] = [];
    const labels: Record<string, string> = {};
    let aiAvailable = true;
    for (const image of body.images.slice(0, 6)) {
      const saved = await saveImage(image.data);
      urls.push(saved.url);
      if (kind !== "work" || !aiAvailable) continue;
      try {
        const result = await skillsFromPhoto({ data: saved.jpeg, mimetype: "image/jpeg" }, categories);
        found.push(...result.skills);
        const [label] = jev.normalizeSkills(result.skills, worker.categoryIds);
        if (label) labels[saved.url] = label;
      } catch (err) {
        if (!(err instanceof GeminiUnavailable)) throw err;
        aiAvailable = false;
      }
    }

    const skillTags = jev.normalizeSkills(found, worker.categoryIds);
    const skills = [...new Set([...worker.skills, ...skillTags])];
    await prisma.workerProfile.update({
      where: { id: workerId },
      data:
        kind === "profile"
          ? { photoUrl: urls[0] as string }
          : { photos: { push: urls }, skills, photoSkills: { ...(worker.photoSkills as Record<string, string>), ...labels } },
    });
    return { urls, skillTags, aiAvailable: kind === "work" ? aiAvailable : null, worker: await workerCard(workerId) };
  });

  /** Accepts a photo or a PDF scan (read by the AI) or a typed number. Only the salted hash is stored. */
  app.post("/workers/me/cnic", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const workerId = await targetWorkerId(req);
    const body = await readBody(req);
    const typed = body.fields.cnic;
    let digits: string | null = null;

    if (typed) {
      digits = cleanCnic(typed);
    } else {
      const image = body.images[0];
      if (!image) throw badRequest("CNIC_REQUIRED", "Attach a CNIC photo or type the number.");
      try {
        const read = await readCnic(await documentForAi(image.data));
        digits = read.cnic ? cleanCnic(read.cnic) : null;
      } catch (err) {
        if (!(err instanceof GeminiUnavailable)) throw err;
        throw aiUnavailable("The CNIC photo could not be read right now. Please type the number instead.");
      }
    }

    if (!digits) throw unprocessable("CNIC_UNREADABLE", "We could not read a 13-digit CNIC number.");
    await registerCnic(workerId, digits);
    return { ok: true };
  });

  app.get("/workers/me/earnings", { preHandler: requireAuth }, async (req) => {
    const auth = authOf(req);
    if (!auth.worker) throw forbidden("Finish worker sign-up first.");
    const rows = await prisma.earning.findMany({
      where: { workerId: auth.worker.id },
      orderBy: { earnedAt: "desc" },
      take: 200,
    });
    const now = new Date();
    const dayStart = startOfDayPkt(now);
    const weekStart = startOfWeekPkt(now);
    const sumSince = (from: Date) => rows.filter((r) => r.earnedAt >= from).reduce((s, r) => s + r.amount, 0);
    const paidJobs = await prisma.earning.findMany({
      where: { workerId: auth.worker.id },
      distinct: ["jobId"],
      select: { jobId: true },
    });
    const today = todayPkt(now);
    const daily = [6, 5, 4, 3, 2, 1, 0].map((back) => {
      const date = addDaysIso(today, -back);
      return { date, amount: rows.filter((r) => todayPkt(r.earnedAt) === date).reduce((s, r) => s + r.amount, 0) };
    });
    return { items: rows.map(toEarning), today: sumSince(dayStart), week: sumSince(weekStart), jobCount: paidJobs.length, daily };
  });

  app.get("/workers/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const card = await workerCard(id);
    if (!card) throw notFound("Worker");
    const [reviews, profile] = await Promise.all([
      prisma.review.findMany({
        where: { direction: "customer_to_worker", job: { assignments: { some: { workerId: id } } } },
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.workerProfile.findUniqueOrThrow({ where: { id }, select: { photos: true, photoSkills: true } }),
    ]);
    return { ...card, reviews: reviews.map(toReviewView), pastWork: toPastWork(profile) };
  });
}
