import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";
import type { Category } from "@prisma/client";
import type { OnboardField } from "@kaamwala/contracts";
import { z } from "zod";
import { firstSuccess } from "./budget";
import { env } from "./env";
import { getActiveCategories } from "./jev";
import { generateWithOpenAi, openaiConfigured } from "./openai";
import { cleanMime, type FilePart } from "./uploads";

const client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

/** True when any AI provider is available. OpenAI is tried first, and Gemini is the backup. */
export const geminiConfigured = Boolean(client) || openaiConfigured;

/** Gemini was not configured, failed, timed out or returned something unusable. */
export class GeminiUnavailable extends Error {}

/** One deadline for the whole chain, so a stalled network cannot hold a request for minutes. */
const GEMINI_BUDGET = { totalMs: 30_000, firstMs: 18_000, minAttemptMs: 1_000 };
const models = [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)];

async function generateWith<T>(
  ai: GoogleGenAI,
  model: string,
  parts: Part[],
  schema: Schema,
  validator: z.ZodType<T, z.ZodTypeDef, unknown>,
  abortSignal: AbortSignal,
): Promise<T> {
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1, abortSignal },
  });
  const parsed = validator.safeParse(JSON.parse(response.text ?? ""));
  if (!parsed.success) throw new Error("unexpected response shape");
  return parsed.data;
}

/** Tries each configured model in turn. Fails only when none of them gives a usable answer in time. */
async function generate<T>(parts: Part[], schema: Schema, validator: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  if (openaiConfigured) {
    try {
      return await generateWithOpenAi(parts, schema, validator);
    } catch (err) {
      console.warn(`OpenAI could not answer: ${(err instanceof Error ? err.message : "unknown").slice(0, 200)}`);
    }
  }
  if (!client) throw new GeminiUnavailable("No AI provider could answer.");
  try {
    return await firstSuccess(
      models,
      (model, signal) => generateWith(client, model, parts, schema, validator, signal),
      GEMINI_BUDGET,
      (model, err) =>
        console.warn(`Gemini model ${model} failed: ${(err instanceof Error ? err.message : "unknown").slice(0, 200)}`),
    );
  } catch {
    throw new GeminiUnavailable("No Gemini model gave a usable answer.");
  }
}

const inline = (file: FilePart): Part => ({
  inlineData: { mimeType: cleanMime(file.mimetype), data: file.data.toString("base64") },
});

const categoryList = (categories: Category[] = getActiveCategories()) =>
  categories
    .map(
      (c) =>
        `- id "${c.id}": ${c.nameEn} / ${c.nameRoman} / ${c.nameUr}. Words: ${c.keywords.slice(0, 20).join(", ")}. Skills: ${c.skills.join(", ")}.`,
    )
    .join("\n");

const str = (description: string, nullable = false): Schema => ({ type: Type.STRING, description, nullable });
const int = (description: string, nullable = false): Schema => ({ type: Type.INTEGER, description, nullable });
const strings = (description: string): Schema => ({
  type: Type.ARRAY,
  items: { type: Type.STRING },
  description,
});

const TRANSCRIPT_RULE =
  "Transcribe speech faithfully. The speaker uses Urdu or Punjabi-mixed Urdu. Write the transcript in Urdu (Nastaliq) script. If there is no intelligible speech, return an empty transcript and do not invent anything.";

export interface OnboardingExtract {
  transcript: string;
  name: string | null;
  categoryIds: string[];
  skills: string[];
  years: number | null;
  rate: number | null;
  area: string | null;
  workingHours: string | null;
}

const FIELD_QUESTIONS: Record<OnboardField, string> = {
  name: 'their name. Put it in "name".',
  trade: 'what trade they do. Put it in "categoryIds".',
  skills: 'which skills they have. Put them in "skills".',
  years: 'how many years of experience they have. A bare number word such as paanch or پانچ is the answer. Put it in "years".',
  rate: 'their daily rate in Pakistani rupees. A bare amount is the answer. Put it in "rate".',
  area: 'which area or sector they work in. Put it in "area".',
  workingHours: 'their working hours. Put them in "workingHours".',
};

export function extractOnboarding(input: { audio?: FilePart | null; text?: string | null; field?: OnboardField | null }) {
  const parts: Part[] = [];
  if (input.audio) parts.push(inline(input.audio));
  const typed = input.text ? `Their words: """${input.text}"""` : "";
  const source = input.audio ? `${TRANSCRIPT_RULE}\n${typed}` : `${typed}\nUse their words as the transcript.`;
  const task = input.field
    ? `They were asked only for ${FIELD_QUESTIONS[input.field]} Their reply answers that question and nothing else, even if it is a single word. Leave every other field null or empty.`
    : "Extract name, trades, skills, years of experience, area, rate in Pakistani rupees and working hours.";
  parts.push({
    text: `A skilled trade worker in Islamabad or Rawalpindi, Pakistan is ${input.field ? "correcting one detail of" : "introducing themselves to build"} a profile.
${source}
${task}
Use null for anything they did not say. Never guess.
Choose categoryIds only from this list:
${categoryList()}`,
  });
  return generate<OnboardingExtract>(
    parts,
    {
      type: Type.OBJECT,
      properties: {
        transcript: str("What was said"),
        name: str("Person's name", true),
        categoryIds: strings("Matching category ids from the list"),
        skills: strings("Skills they mentioned, short"),
        years: int("Years of experience", true),
        rate: int("Rate in Pakistani rupees", true),
        area: str("Area or sector, e.g. G-9 or Saddar", true),
        workingHours: str("Working hours as spoken", true),
      },
      required: ["transcript", "categoryIds", "skills"],
    },
    z.object({
      transcript: z.string(),
      name: z.string().nullable().default(null),
      categoryIds: z.array(z.string()),
      skills: z.array(z.string()),
      years: z.number().int().nullable().default(null),
      rate: z.number().int().nullable().default(null),
      area: z.string().nullable().default(null),
      workingHours: z.string().nullable().default(null),
    }),
  );
}

export interface CustomerExtract {
  transcript: string;
  name: string | null;
  area: string | null;
  address: string | null;
}

export function extractCustomer(input: { audio?: FilePart | null; text?: string | null }) {
  const parts: Part[] = [];
  if (input.audio) parts.push(inline(input.audio));
  const typed = input.text ? `Their words: """${input.text}"""` : "";
  const source = input.audio ? `${TRANSCRIPT_RULE}\n${typed}` : `${typed}\nUse their words as the transcript.`;
  parts.push({
    text: `A household customer in Islamabad or Rawalpindi, Pakistan is signing up.
${source}
Extract their name, their area or sector, and their street address.
Use null for anything they did not say. Never guess.`,
  });
  return generate<CustomerExtract>(
    parts,
    {
      type: Type.OBJECT,
      properties: {
        transcript: str("What was said"),
        name: str("Person's name", true),
        area: str("Area or sector, e.g. G-9 or Saddar", true),
        address: str("Street and house number", true),
      },
      required: ["transcript"],
    },
    z.object({
      transcript: z.string(),
      name: z.string().nullable().default(null),
      area: z.string().nullable().default(null),
      address: z.string().nullable().default(null),
    }),
  );
}

export interface ProblemExtract {
  transcript: string | null;
  categoryId: string | null;
  skills: string[];
  urgency: "low" | "normal" | "urgent";
  priceMin: number | null;
  priceMax: number | null;
  durationDays: number | null;
  summary: string;
  confidence: number;
}

export function analyseProblem(input: { audio?: FilePart | null; image?: FilePart | null; text?: string | null }) {
  const parts: Part[] = [];
  if (input.audio) parts.push(inline(input.audio));
  if (input.image) parts.push(inline(input.image));
  const categories = getActiveCategories();
  const floors = categories.map((c) => `${c.id}: floor Rs ${c.floorPrice}`).join(", ");
  parts.push({
    text: `A household in Islamabad or Rawalpindi, Pakistan describes a problem and needs a skilled worker.
${input.audio ? TRANSCRIPT_RULE : "transcript must be null because there is no audio."}
${input.text ? `Their words: """${input.text}"""` : ""}
${input.image ? "Use the photo to understand what is broken or what work is needed." : ""}
Choose categoryId only from this list, or null if none fits:
${categoryList(categories)}
Estimate a fair local labour price range in Pakistani rupees PER DAY, excluding parts, never below the per-day floor (${floors}).
durationDays: how many working days they asked for, 1 to 30, or null if they did not say. Do not guess it.
summary: one short sentence in Roman Urdu that mentions the number of days if they gave one. confidence: 0 to 1. Do not invent details that are not present.`,
  });
  return generate<ProblemExtract>(
    parts,
    {
      type: Type.OBJECT,
      properties: {
        transcript: str("What was said, or null", true),
        categoryId: str("Category id from the list, or null", true),
        skills: strings("Skills needed, short"),
        urgency: { type: Type.STRING, enum: ["low", "normal", "urgent"] },
        priceMin: int("Low estimate in rupees per day", true),
        priceMax: int("High estimate in rupees per day", true),
        durationDays: int("Working days requested, or null", true),
        summary: str("One short sentence in Roman Urdu"),
        confidence: { type: Type.NUMBER },
      },
      required: ["categoryId", "skills", "urgency", "summary", "confidence"],
    },
    z.object({
      transcript: z.string().nullable().default(null),
      categoryId: z.string().nullable(),
      skills: z.array(z.string()),
      urgency: z.enum(["low", "normal", "urgent"]),
      priceMin: z.number().int().nullable().default(null),
      priceMax: z.number().int().nullable().default(null),
      durationDays: z.number().int().nullable().default(null),
      summary: z.string(),
      confidence: z.number(),
    }),
  );
}

export function transcribe(audio: FilePart, jobFacts: string) {
  return generate<{ transcript: string }>(
    [
      inline(audio),
      {
        text: `${TRANSCRIPT_RULE} This is a voice note between a customer and a worker about a job. The booking so far, only to help you hear numbers and dates correctly: ${jobFacts}. Transcribe what was said even if it differs from this.`,
      },
    ],
    { type: Type.OBJECT, properties: { transcript: str("What was said") }, required: ["transcript"] },
    z.object({ transcript: z.string() }),
  );
}

export interface ReviewExtract {
  transcript: string;
  rating: number | null;
  tags: string[];
}

export function summariseReview(audio: FilePart, direction: "customer_to_worker" | "worker_to_customer", jobFacts: string) {
  const guide =
    direction === "customer_to_worker"
      ? 'Tags describe the worker, e.g. "waqt ka paband", "munasib qeemat", "saaf kaam", "tameez daar", "mahir".'
      : 'Tags describe the customer, e.g. "waqt par adaigi", "extra diya", "acha rawaiya", "adaigi mein der".';
  return generate<ReviewExtract>(
    [
      inline(audio),
      {
        text: `A spoken review after a job in Pakistan. The job was: ${jobFacts}. ${TRANSCRIPT_RULE}
Summarise it into 1 to 4 short trust tags in Roman Urdu, each 1 to 3 words. ${guide}
Only use what was actually said. rating: 1 to 5 if the sentiment is clear, otherwise null.`,
      },
    ],
    {
      type: Type.OBJECT,
      properties: {
        transcript: str("What was said"),
        rating: int("1 to 5, or null", true),
        tags: strings("Short Roman Urdu trust tags"),
      },
      required: ["transcript", "tags"],
    },
    z.object({
      transcript: z.string(),
      rating: z.number().int().min(1).max(5).nullable().default(null),
      tags: z.array(z.string()),
    }),
  );
}

export function skillsFromPhoto(image: FilePart, categories: Category[]) {
  return generate<{ skills: string[] }>(
    [
      inline(image),
      {
        text: `This photo shows past work by a tradesperson. List only the skills the photo clearly shows.
Prefer these names: ${categories.flatMap((c) => c.skills).join(", ")}. Return an empty list if the photo shows no work.`,
      },
    ],
    { type: Type.OBJECT, properties: { skills: strings("Skills visible in the photo") }, required: ["skills"] },
    z.object({ skills: z.array(z.string()) }),
  );
}

export function readCnic(image: FilePart) {
  return generate<{ cnic: string | null }>(
    [
      inline(image),
      {
        text: "This should be a Pakistani CNIC, as a photo or a scanned PDF. Return its 13-digit identity number in the form 12345-1234567-1. Return null if this is not a CNIC or the number is not fully legible. Never guess a digit.",
      },
    ],
    {
      type: Type.OBJECT,
      properties: { cnic: str("13-digit CNIC number, or null", true) },
      required: [],
    },
    z.object({ cnic: z.string().nullable().default(null) }),
  );
}

export function writeJobCard(job: {
  description: string;
  area: string;
  scheduledFor: Date | null;
  categoryName: string;
  transcripts: string[];
  facts: string;
}) {
  return generate<{ task: string; time: string }>(
    [
      {
        text: `Write the job card for a ${job.categoryName} booking in Pakistan, using only these facts.
Description: """${job.description}"""
Area: ${job.area}
Booking: ${job.facts}
Scheduled for: ${job.scheduledFor ? job.scheduledFor.toISOString() : "not set"}
Conversation: ${job.transcripts.join(" | ") || "none"}
task: one short sentence in Roman Urdu saying what is to be done, and for how many days if more than one. Do not state any price.
time: when it will happen, in Roman Urdu, taken from the facts. Use "Jald az jald" if no time was agreed.`,
      },
    ],
    {
      type: Type.OBJECT,
      properties: { task: str("The task"), time: str("When") },
      required: ["task", "time"],
    },
    z.object({ task: z.string(), time: z.string() }),
  );
}
