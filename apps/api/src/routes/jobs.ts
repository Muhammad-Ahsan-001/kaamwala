import { canonicalText } from "@kaamwala/jev";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ReviewDraft } from "@kaamwala/contracts";
import { z } from "zod";
import { authOf, requireAuth } from "../auth";
import { prisma } from "../db";
import { MAX_DURATION_DAYS, isValidStartDate, jobFacts } from "../domain/days";
import {
  acceptOffer,
  assertCanReadMessages,
  cancelJob,
  completeDay,
  completeJob,
  confirmJob,
  createJob,
  createOffer,
  disputeJob,
  generateCard,
  getJob,
  listMine,
  listOffers,
  listOpenFeed,
  movePrice,
  requireParty,
  workerAccept,
  workerDecline,
} from "../domain/jobs";
import { recallReading, readingKey, rememberReading, type ReviewReading } from "../domain/reviewDrafts";
import { BEHAVIOUR_RATING, hirerTagsFrom } from "../domain/trust";
import { env } from "../env";
import { aiUnavailable, badRequest, conflict, forbidden, notFound } from "../errors";
import { GeminiUnavailable, summariseReview, transcribe } from "../gemini";
import { todayPkt } from "../geo";
import { hub } from "../hub";
import { jev } from "../jev";
import { perUserLimit } from "../limits";
import { pushToUsers } from "../push";
import { jobInclude, toMessage, toReview } from "../serialize";
import { assertAudioFile, isOwnImageUrl, readBody, saveAudio, saveImage, type FilePart } from "../uploads";

const aiLimit = { rateLimit: { max: env.RATE_LIMIT_AI_PER_MIN, timeWindow: "1 minute" } };
const SCHEDULE_GRACE_MS = 5 * 60 * 1000;

const Id = z.object({ id: z.string() });
const CreateJob = z
  .object({
    mode: z.enum(["direct", "open", "crew"]),
    workerId: z.string().optional(),
    crewId: z.string().optional(),
    categoryId: z.string(),
    description: z.string().trim().min(1).max(2000),
    area: z.string().trim().min(1).max(120),
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    urgency: z.enum(["low", "normal", "urgent"]).optional(),
    scheduledFor: z.string().datetime().optional(),
    photoUrls: z.array(z.string().url().refine(isOwnImageUrl, { message: "Upload the photo first." })).max(6).optional(),
    proposedPrice: z.number().int().positive().optional(),
    priceMin: z.number().int().positive().optional(),
    priceMax: z.number().int().positive().optional(),
    durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS).default(1),
    startDate: z
      .string()
      .refine((d) => isValidStartDate(d), { message: "The start date must be today or within the next 14 days." })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.scheduledFor) return;
    const at = new Date(body.scheduledFor);
    const day = todayPkt(at);
    const fail = (message: string) => ctx.addIssue({ code: "custom", message, path: ["scheduledFor"] });
    if (at.getTime() < Date.now() - SCHEDULE_GRACE_MS) fail("The scheduled time has already passed.");
    else if (!isValidStartDate(day)) fail("The scheduled time must be today or within the next 14 days.");
    else if (body.startDate && body.startDate !== day) fail("The scheduled time must fall on the start date.");
  })
  // A time on its own fixes the day, so the card and the booked days can never disagree.
  .transform((body) => ({
    ...body,
    startDate: body.startDate ?? (body.scheduledFor ? todayPkt(new Date(body.scheduledFor)) : undefined),
  }));
const CreateOffer = z.object({
  price: z.number().int().positive(),
  etaMinutes: z.number().int().positive().max(10_080).optional(),
  crewId: z.string().optional(),
});

async function jobAudience(jobId: string, customerId: string): Promise<string[]> {
  const rows = await prisma.jobAssignment.findMany({
    where: { jobId },
    select: { worker: { select: { userId: true } } },
  });
  return [customerId, ...rows.map((r) => r.worker.userId)];
}

/** Runs after the reply, so a slow transcription never holds up sending a voice note. */
async function transcribeNote(messageId: string, audio: FilePart, audience: string[], facts: string): Promise<void> {
  try {
    const { transcript } = await transcribe(audio, facts);
    if (!transcript.trim()) return;
    const match = jev.match(transcript);
    const message = await prisma.message.update({
      where: { id: messageId },
      data: {
        transcript,
        detected: match.best
          ? { categoryId: match.best.categoryId, skills: match.best.skills.map((s) => s.skill) }
          : undefined,
      },
    });
    hub.toUsers(audience, { type: "message.transcribed", message: toMessage(message) });
  } catch (err) {
    if (!(err instanceof GeminiUnavailable)) console.error("voice note transcription failed", err);
  }
}

export async function jobRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.post("/uploads/image", { ...auth, config: perUserLimit(env.RATE_LIMIT_UPLOADS_PER_MIN) }, async (req) => {
    const body = await readBody(req);
    const image = body.images[0];
    if (!image) throw badRequest("IMAGE_REQUIRED", "Attach a photo.");
    return { url: (await saveImage(image.data)).url };
  });

  app.post("/jobs", { ...auth, config: perUserLimit(env.RATE_LIMIT_JOBS_PER_MIN) }, async (req, reply) => {
    return reply.code(201).send(await createJob(authOf(req), CreateJob.parse(req.body)));
  });

  app.get("/jobs/mine", auth, async (req) => ({ items: await listMine(authOf(req)) }));
  app.get("/jobs/open", auth, async (req) => ({ items: await listOpenFeed(authOf(req)) }));
  app.get("/jobs/:id", auth, async (req) => getJob(authOf(req), Id.parse(req.params).id));

  app.get("/jobs/:id/offers", auth, async (req) => ({ items: await listOffers(authOf(req), Id.parse(req.params).id) }));

  app.post("/jobs/:id/offers", auth, async (req, reply) => {
    const offer = await createOffer(authOf(req), Id.parse(req.params).id, CreateOffer.parse(req.body));
    return reply.code(201).send(offer);
  });

  app.post("/jobs/:id/offers/:offerId/accept", auth, async (req) => {
    const params = z.object({ id: z.string(), offerId: z.string() }).parse(req.params);
    return acceptOffer(authOf(req), params.id, params.offerId);
  });

  app.post("/jobs/:id/accept", auth, async (req) => workerAccept(authOf(req), Id.parse(req.params).id));
  app.post("/jobs/:id/decline", auth, async (req) => workerDecline(authOf(req), Id.parse(req.params).id));

  app.post("/jobs/:id/price", auth, async (req) => {
    const { direction } = z.object({ direction: z.enum(["up", "down"]) }).parse(req.body);
    return movePrice(authOf(req), Id.parse(req.params).id, direction);
  });

  app.post("/jobs/:id/card", { ...auth, config: aiLimit }, async (req) => generateCard(authOf(req), Id.parse(req.params).id));
  app.post("/jobs/:id/confirm", auth, async (req) => confirmJob(authOf(req), Id.parse(req.params).id));
  app.post("/jobs/:id/complete", auth, async (req) => completeJob(authOf(req), Id.parse(req.params).id));

  app.post("/jobs/:id/days/:dayNumber/complete", auth, async (req) => {
    const params = z.object({ id: z.string(), dayNumber: z.coerce.number().int().positive() }).parse(req.params);
    return completeDay(authOf(req), params.id, params.dayNumber);
  });

  app.post("/jobs/:id/cancel", auth, async (req) => cancelJob(authOf(req), Id.parse(req.params).id));

  app.post("/jobs/:id/dispute", auth, async (req) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    return disputeJob(authOf(req), Id.parse(req.params).id, reason);
  });

  app.get("/jobs/:id/messages", auth, async (req) => {
    const { id } = Id.parse(req.params);
    const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw notFound("Job");
    assertCanReadMessages(authOf(req), job);
    const rows = await prisma.message.findMany({ where: { jobId: id }, orderBy: { createdAt: "asc" } });
    return { items: rows.map(toMessage) };
  });

  app.post("/jobs/:id/messages", { ...auth, config: aiLimit }, async (req, reply) => {
    const ctx = authOf(req);
    const { id } = Id.parse(req.params);
    const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw notFound("Job");
    requireParty(ctx, job);

    const body = await readBody(req);
    const text = body.fields.text?.trim() || null;
    if (!body.audio && !text) throw badRequest("INPUT_REQUIRED", "Send a voice note or text.");

    // Stored as a file name. toMessage turns it into a short-lived signed link.
    const audioUrl = body.audio ? await saveAudio(body.audio.data, body.audio.mimetype) : null;
    const match = text ? jev.match(text) : null;
    const message = await prisma.message.create({
      data: {
        jobId: id,
        senderId: ctx.user.id,
        audioUrl,
        text,
        detected: match?.best
          ? { categoryId: match.best.categoryId, skills: match.best.skills.map((s) => s.skill) }
          : undefined,
      },
    });

    const audience = await jobAudience(id, job.customerId);
    hub.toUsers(audience, { type: "message.created", message: toMessage(message) });
    void pushToUsers(audience.filter((u) => u !== ctx.user.id), {
      title: "نیا پیغام",
      body: text ?? "صوتی پیغام",
      url: `/app/jobs/${id}`,
      tag: `${id}-messages`,
    }).catch(() => undefined);

    if (body.audio) void transcribeNote(message.id, body.audio, audience, jobFacts(job));
    return reply.code(201).send(toMessage(message));
  });

  /** Shows what a spoken review said before it is submitted. Only Gemini can read audio, so nothing is made up. */
  app.post("/jobs/:id/reviews/draft", { ...auth, config: aiLimit }, async (req): Promise<ReviewDraft> => {
    const { job, direction } = await openReview(req);
    const body = await readBody(req);
    if (!body.audio) throw badRequest("INPUT_REQUIRED", "Send a voice note.");
    // Checked first, so a file that is not audio never costs a model call.
    assertAudioFile(body.audio.data, body.audio.mimetype);
    const key = readingKey(job.id, direction, body.audio.data);
    let reading: ReviewReading | null = recallReading(key);
    if (!reading) {
      try {
        reading = await summariseReview(body.audio, direction, jobFacts(job));
      } catch (err) {
        if (!(err instanceof GeminiUnavailable)) throw err;
        throw aiUnavailable("The voice review could not be processed. Please tap a rating.");
      }
      rememberReading(key, reading);
    }
    return { transcript: reading.transcript, tags: reading.tags, rating: reading.rating, source: "gemini" };
  });

  app.post("/jobs/:id/reviews", { ...auth, config: aiLimit }, async (req, reply) => {
    const ctx = authOf(req);
    const { job, id, direction } = await openReview(req);
    const body = await readBody(req);
    const Fields = z.object({
      rating: z.coerce.number().int().min(1).max(5).optional(),
      tags: z.string().optional(),
      paidOnTime: z.enum(["true", "false"]).optional(),
      paidExtra: z.enum(["true", "false"]).optional(),
      behaviour: z.enum(["good", "okay", "bad"]).optional(),
    });
    const fields = Fields.parse(body.fields);
    const aboutHirer = direction === "worker_to_customer";
    const answers = aboutHirer
      ? {
          paidOnTime: fields.paidOnTime === undefined ? undefined : fields.paidOnTime === "true",
          paidExtra: fields.paidExtra === undefined ? undefined : fields.paidExtra === "true",
          behaviour: fields.behaviour,
        }
      : {};
    const tapped = [...parseTags(fields.tags), ...hirerTagsFrom(answers)];
    const tappedRating = fields.rating ?? (answers.behaviour ? BEHAVIOUR_RATING[answers.behaviour] : undefined);
    if (!body.audio && tappedRating === undefined) throw badRequest("RATING_REQUIRED", "Tap a rating or record a review.");
    // Checked first, so a file that is not audio never costs a model call.
    if (body.audio) assertAudioFile(body.audio.data, body.audio.mimetype);

    let transcript: string | null = null;
    let aiTags: string[] = [];
    let rating = tappedRating;
    let aiAvailable = true;

    if (body.audio) {
      const seen = recallReading(readingKey(id, direction, body.audio.data));
      if (seen) {
        // The reviewer has already seen these and chosen, so only the tags they sent back count.
        transcript = seen.transcript;
        rating ??= seen.rating ?? undefined;
      } else {
        try {
          const summary = await summariseReview(body.audio, direction, jobFacts(job));
          transcript = summary.transcript;
          aiTags = summary.tags;
          rating ??= summary.rating ?? undefined;
        } catch (err) {
          if (!(err instanceof GeminiUnavailable)) throw err;
          aiAvailable = false;
        }
      }
      // A voice-only review with no AI has no rating to record, so ask for a tap instead of inventing one.
      if (rating === undefined) throw aiUnavailable("The voice review could not be processed. Please tap a rating.");
    }

    const reviewee = await revieweeOf(job, direction);
    const audioUrl = body.audio ? await saveAudio(body.audio.data, body.audio.mimetype) : null;
    // Jev's canonical form merges spelling variants of the same tag, tapped or spoken.
    const tags = [
      ...new Map(
        [...tapped, ...aiTags]
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => [canonicalText(t), t] as const),
      ).values(),
    ].slice(0, 8);

    try {
      const review = await prisma.review.create({
        data: {
          jobId: id,
          direction,
          reviewerId: ctx.user.id,
          revieweeId: reviewee,
          rating: rating as number,
          audioUrl,
          transcript,
          tags,
        },
      });
      void pushToUsers([reviewee], {
        title: "نئی رائے",
        body: `${review.rating} ستارے`,
        url: `/app/jobs/${id}`,
        tag: `${id}-review`,
      }).catch(() => undefined);
      return reply.code(201).send({ ...toReview(review), aiAvailable });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") throw conflict("ALREADY_REVIEWED", "You already reviewed this job.");
      throw err;
    }
  });
}

/** Who may review this job now, and which way the review points. */
async function openReview(req: FastifyRequest) {
  const { id } = Id.parse(req.params);
  const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw notFound("Job");
  const side = requireParty(authOf(req), job);
  if (side === "member") throw forbidden("Only the crew leader can review the customer.");
  if (job.status !== "completed") throw conflict("INVALID_JOB_STATE", "Reviews open once the job is complete.");
  const direction = side === "customer" ? ("customer_to_worker" as const) : ("worker_to_customer" as const);
  return { job, id, direction };
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    // Multipart forms may send a plain comma-separated list.
  }
  return raw.split(",");
}

async function revieweeOf(
  job: { id: string; customerId: string; crewId: string | null; assignments: { workerId: string }[] },
  direction: "customer_to_worker" | "worker_to_customer",
): Promise<string> {
  if (direction === "worker_to_customer") return job.customerId;
  const crew = job.crewId ? await prisma.crew.findUnique({ where: { id: job.crewId } }) : null;
  const workerId = crew?.leaderId ?? job.assignments[0]?.workerId;
  const worker = await prisma.workerProfile.findUniqueOrThrow({ where: { id: workerId as string } });
  return worker.userId;
}
