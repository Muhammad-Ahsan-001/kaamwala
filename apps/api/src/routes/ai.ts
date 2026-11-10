import { OnboardField, type ProblemAnalysis, type WorkerProfileDraft } from "@kaamwala/contracts";
import { detectUrgency, extractDurationDays } from "@kaamwala/jev";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AREA_NAMES } from "../areas";
import { requireAuth } from "../auth";
import { prisma } from "../db";
import { MAX_DURATION_DAYS } from "../domain/days";
import { env } from "../env";
import { AppError, aiUnavailable, badRequest } from "../errors";
import {
  GeminiUnavailable,
  analyseProblem,
  extractOnboarding,
  type OnboardingExtract,
  type ProblemExtract,
} from "../gemini";
import { getActiveCategories, jev } from "../jev";
import { MAX_TEXT_CHARS, imageForAi, readBody, type FilePart } from "../uploads";

const aiLimit = { rateLimit: { max: env.RATE_LIMIT_AI_PER_MIN, timeWindow: "1 minute" } };

const VOICE_UNAVAILABLE = "Voice could not be processed right now. Please type instead.";
const IMAGE_UNAVAILABLE = "The photo could not be read right now. Please describe the problem in words.";

/**
 * Gemini's reading goes through Jev so trades and skills always resolve to admin-managed categories.
 * Jev picks a trade only when Gemini gave none, and never adds one to a valid answer.
 */
export function buildDraft(transcript: string, ai: OnboardingExtract | null, field: OnboardField | null): WorkerProfileDraft {
  const match = jev.match(transcript);
  const areas = { areas: AREA_NAMES };
  const hints =
    field === "name" || field === "years" || field === "rate" || field === "area"
      ? jev.parseField(transcript, field, areas)
      : jev.parseProfile(transcript, areas);
  const fromAi = ai?.categoryIds.filter((id) => jev.hasCategory(id)) ?? [];
  const categoryIds = fromAi.length ? [...new Set(fromAi)] : match.best ? [match.best.categoryId] : [];
  const skills = jev.normalizeSkills(
    [...(ai?.skills ?? []), ...categoryIds.flatMap((id) => jev.skillsFor(transcript, id))],
    categoryIds,
  );
  const draft: WorkerProfileDraft = {
    name: ai?.name ?? hints.name,
    categoryIds,
    skills,
    years: ai?.years ?? hints.years,
    rate: ai?.rate ?? hints.rate,
    area: ai?.area ?? hints.area,
    workingHours: ai?.workingHours ?? (field === "workingHours" ? transcript.trim() || null : null),
    transcript,
    source: ai ? "gemini" : "jev_only",
  };
  return field ? onlyField(draft, field) : draft;
}

/** A correction of one answer must not disturb the others. */
function onlyField(draft: WorkerProfileDraft, field: OnboardField): WorkerProfileDraft {
  return {
    ...draft,
    name: field === "name" ? draft.name : null,
    categoryIds: field === "trade" ? draft.categoryIds : [],
    skills: field === "skills" || field === "trade" ? draft.skills : [],
    years: field === "years" ? draft.years : null,
    rate: field === "rate" ? draft.rate : null,
    area: field === "area" ? draft.area : null,
    workingHours: field === "workingHours" ? draft.workingHours : null,
  };
}

/** An estimate from the rates real workers in this category charge, never below the floor. */
async function priceEstimate(categoryId: string | null): Promise<{ min: number | null; max: number | null }> {
  if (!categoryId) return { min: null, max: null };
  const category = getActiveCategories().find((c) => c.id === categoryId);
  const rows = await prisma.workerProfile.findMany({
    where: { categoryIds: { has: categoryId }, approved: true },
    select: { rate: true },
  });
  const rates = rows.map((r) => r.rate).sort((a, b) => a - b);
  const floor = category?.floorPrice ?? 0;
  if (!rates.length) return { min: floor || null, max: null };
  const at = (q: number) => rates[Math.floor((rates.length - 1) * q)] as number;
  return { min: Math.max(floor, at(0.25)), max: Math.max(floor, at(0.75)) };
}

export async function buildAnalysis(text: string | null, ai: ProblemExtract | null): Promise<ProblemAnalysis> {
  const evidence = [text, ai?.transcript, ai?.summary].filter(Boolean).join(" ");
  const match = jev.match(evidence);
  const aiCategory = ai?.categoryId && jev.hasCategory(ai.categoryId) ? ai.categoryId : null;
  // Gemini saying "none of these fits" is an answer. Only its absence, or an unknown id, falls back to Jev.
  const declined = ai !== null && ai.categoryId === null;
  const categoryId = aiCategory ?? (declined ? null : (match.best?.categoryId ?? null));
  const fromJev = categoryId ? jev.skillsFor(evidence, categoryId) : [];
  const skills = categoryId ? jev.normalizeSkills([...(ai?.skills ?? []), ...fromJev], [categoryId]) : [];
  const estimate = await priceEstimate(categoryId);
  const floor = getActiveCategories().find((c) => c.id === categoryId)?.floorPrice ?? 0;
  const clamp = (n: number | null) => (n === null ? null : Math.max(floor, n));

  return {
    transcript: ai?.transcript ?? null,
    categoryId,
    skills,
    urgency: ai?.urgency ?? detectUrgency(evidence),
    priceMin: clamp(ai?.priceMin ?? null) ?? estimate.min,
    priceMax: clamp(ai?.priceMax ?? null) ?? estimate.max,
    // Gemini is told not to guess this, so its null stands. Jev reads the words only when Gemini is away.
    durationDays: ai
      ? ai.durationDays && ai.durationDays >= 1 && ai.durationDays <= MAX_DURATION_DAYS
        ? ai.durationDays
        : null
      : extractDurationDays(evidence),
    summary: ai?.summary ?? (text ?? "").slice(0, 160),
    confidence: Math.min(1, Math.max(0, ai?.confidence ?? match.best?.confidence ?? 0)),
    source: ai ? "gemini" : "jev_only",
  };
}

function assertAudio(file: FilePart | null): void {
  if (file && !/^(audio|video)\//.test(file.mimetype)) {
    throw badRequest("INVALID_AUDIO", "The audio field must contain audio.");
  }
}

const DraftBody = z.object({
  name: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).optional(),
  years: z.number().nullable().optional(),
  rate: z.number().nullable().optional(),
  area: z.string().nullable().optional(),
  workingHours: z.string().nullable().optional(),
});

/** The sentence the app speaks back to the worker before they confirm. */
function readBackLine(draft: z.infer<typeof DraftBody>): string {
  const trades = getActiveCategories()
    .filter((c) => draft.categoryIds?.includes(c.id))
    .map((c) => c.nameUr)
    .join("، ");
  const lines = [
    draft.name ? `آپ کا نام ${draft.name} ہے۔` : null,
    trades ? `آپ ${trades} کا کام کرتے ہیں۔` : null,
    draft.years !== null && draft.years !== undefined ? `آپ کو ${draft.years} سال کا تجربہ ہے۔` : null,
    draft.area ? `آپ کا علاقہ ${draft.area} ہے۔` : null,
    draft.rate ? `آپ کا ریٹ ${draft.rate} روپے ہے۔` : null,
    draft.workingHours ? `آپ کے کام کے اوقات ${draft.workingHours} ہیں۔` : null,
  ].filter(Boolean);
  return lines.length ? `${lines.join(" ")} کیا یہ درست ہے؟` : "ہم آپ کی بات سمجھ نہیں سکے۔ براہ کرم دوبارہ بتائیں۔";
}

export async function aiRoutes(app: FastifyInstance) {
  app.post("/ai/onboard", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const body = await readBody(req);
    const text = body.fields.text?.trim() || null;
    assertAudio(body.audio);
    if (!body.audio && !text) throw badRequest("INPUT_REQUIRED", "Send audio or text.");
    const field = body.fields.field ? OnboardField.parse(body.fields.field) : null;

    try {
      const ai = await extractOnboarding({ audio: body.audio, text, field });
      return buildDraft(ai.transcript || text || "", ai, field);
    } catch (err) {
      if (!(err instanceof GeminiUnavailable)) throw err;
      // Typed text still works through Jev. Audio cannot be understood without Gemini, so say so.
      if (body.audio && !text) throw aiUnavailable(VOICE_UNAVAILABLE);
      return buildDraft(text as string, null, field);
    }
  });

  app.post("/ai/problem", { preHandler: requireAuth, config: aiLimit }, async (req) => {
    const body = await readBody(req);
    const text = body.fields.text?.trim() || null;
    const rawImage = body.images[0] ?? null;
    assertAudio(body.audio);
    if (!body.audio && !rawImage && !text) throw badRequest("INPUT_REQUIRED", "Send audio, a photo or text.");

    let image: FilePart | null = null;
    if (rawImage) {
      try {
        image = await imageForAi(rawImage.data);
      } catch (err) {
        // An unreadable photo should not cost the customer the words or the voice note sent with it.
        if (!(err instanceof AppError) || (!text && !body.audio)) throw err;
      }
    }

    try {
      const ai = await analyseProblem({ audio: body.audio, image, text });
      return await buildAnalysis(text, ai);
    } catch (err) {
      if (!(err instanceof GeminiUnavailable)) throw err;
      if (text) return buildAnalysis(text, null);
      throw aiUnavailable(body.audio ? VOICE_UNAVAILABLE : IMAGE_UNAVAILABLE);
    }
  });

  app.post("/ai/tts-text", { preHandler: requireAuth }, async (req) => {
    const body = z.object({ draft: DraftBody.optional(), text: z.string().max(MAX_TEXT_CHARS).optional() }).parse(req.body);
    return { text: body.text ?? readBackLine(body.draft ?? {}) };
  });
}
