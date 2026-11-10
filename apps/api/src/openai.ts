import { Type, type Part, type Schema } from "@google/genai";
import { z } from "zod";
import { firstSuccess } from "./budget";
import { env } from "./env";

/**
 * The OpenAI side of the AI layer. Callers build one provider-neutral request
 * (text, audio and image parts plus a schema) and this turns it into OpenAI calls.
 * Speech goes through the transcription endpoint first, because phones record
 * WebM or MP4, and then the words go to a chat model with a strict JSON schema.
 */

const API = "https://api.openai.com/v1";

export const openaiConfigured = Boolean(env.OPENAI_API_KEY);

const list = (value: string) =>
  value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

const chatModels = [env.OPENAI_MODEL, ...list(env.OPENAI_FALLBACK_MODELS)];
const transcribeModels = [env.OPENAI_TRANSCRIBE_MODEL, ...list(env.OPENAI_TRANSCRIBE_FALLBACK_MODELS)];

const TRANSCRIBE_BUDGET = { totalMs: 22_000, firstMs: 15_000, minAttemptMs: 1_000 };
const CHAT_BUDGET = { totalMs: 22_000, firstMs: 15_000, minAttemptMs: 1_000 };

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Without this hint the speech model often writes Urdu speech in Hindi script. */
const URDU_HINT = "یہ اردو زبان میں گفتگو ہے۔";
const HINDI_SCRIPT = /[ऀ-ॿ]/;
const UNRELATED_SCRIPTS = /[Ѐ-ӿ぀-ヿ一-鿿가-힯]/;

/** In background noise the model can repeat its hint, reworded or twice, as if it had been said. */
const HINT_WORDS = "اردو زبان میں";
const ANY_LETTER = /\p{L}/u;

/** A wrong script or an echoed hint is a failed attempt, so the next model gets a turn. No letters at all means nothing was said. */
function cleanTranscript(text: string): string {
  const words = text.replace(/\s+/g, " ").trim();
  if (HINDI_SCRIPT.test(words) || UNRELATED_SCRIPTS.test(words)) throw new Error("transcript came back in the wrong script");
  if (words.includes(HINT_WORDS)) throw new Error("transcript repeated the hint");
  return ANY_LETTER.test(words) ? words : "";
}

const authorization = () => ({ Authorization: `Bearer ${env.OPENAI_API_KEY}` });

const warn = (model: string, err: unknown) =>
  console.warn(`OpenAI model ${model} failed: ${(err instanceof Error ? err.message : "unknown").slice(0, 200)}`);

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string } } | null;
  return new Error(`HTTP ${res.status} ${body?.error?.code ?? body?.error?.type ?? ""}`.trim());
}

/** Strict mode wants every property listed as required, so "optional" has to be expressed as nullable. */
export function toJsonSchema(schema: Schema): Record<string, unknown> {
  const nullable = schema.nullable === true;
  const typed = (type: string) => (nullable ? [type, "null"] : type);
  const description = schema.description ? { description: schema.description } : {};
  switch (schema.type) {
    case Type.OBJECT: {
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      return {
        type: typed("object"),
        properties: Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [
            key,
            toJsonSchema(required.has(key) ? value : { ...value, nullable: true }),
          ]),
        ),
        required: Object.keys(properties),
        additionalProperties: false,
        ...description,
      };
    }
    case Type.ARRAY:
      return { type: typed("array"), items: toJsonSchema(schema.items ?? { type: Type.STRING }), ...description };
    case Type.STRING:
      return {
        type: typed("string"),
        ...(schema.enum ? { enum: nullable ? [...schema.enum, null] : schema.enum } : {}),
        ...description,
      };
    case Type.INTEGER:
      return { type: typed("integer"), ...description };
    case Type.NUMBER:
      return { type: typed("number"), ...description };
    case Type.BOOLEAN:
      return { type: typed("boolean"), ...description };
    default:
      throw new Error(`Unsupported schema type: ${String(schema.type)}`);
  }
}

async function transcribeWith(model: string, audio: Buffer, mime: string, signal: AbortSignal): Promise<string> {
  const extension = AUDIO_EXTENSIONS[mime];
  if (!extension) throw new Error(`audio type not supported: ${mime}`);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `speech.${extension}`);
  form.append("model", model);
  form.append("language", "ur");
  form.append("response_format", "json");
  form.append("temperature", "0");
  // Whisper writes Urdu script by itself and handles noise well, so it gets neither of these.
  if (!model.startsWith("whisper")) {
    form.append("prompt", URDU_HINT);
    // Voice detection is what stops a silent recording being turned into invented words.
    form.append("chunking_strategy", "auto");
  }
  const res = await fetch(`${API}/audio/transcriptions`, { method: "POST", headers: authorization(), body: form, signal });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { text?: unknown };
  if (typeof body.text !== "string") throw new Error("no text in transcription");
  return cleanTranscript(body.text);
}

type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

async function chatWith(
  model: string,
  content: ChatContent[],
  schema: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { ...authorization(), "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      store: false,
      messages: [{ role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
      ...(env.OPENAI_REASONING_EFFORT ? { reasoning_effort: env.OPENAI_REASONING_EFFORT } : {}),
    }),
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new Error("the model refused this request");
  return JSON.parse(message?.content ?? "");
}

const SPEECH_INSTRUCTIONS =
  "Speak in warm, clear, native Pakistani Urdu, like a kind neighbour explaining something to a person who cannot read. Use natural Urdu pronunciation, not Hindi or Arabic. Keep an unhurried pace.";

/** Spoken Urdu as MP3, in the same voice as the pre-recorded question clips. */
export async function synthesizeUrdu(text: string): Promise<Buffer> {
  const res = await fetch(`${API}/audio/speech`, {
    method: "POST",
    headers: { ...authorization(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL,
      voice: "coral",
      input: text,
      instructions: SPEECH_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw await failure(res);
  return Buffer.from(await res.arrayBuffer());
}

/** Throws when OpenAI cannot give a usable answer, so the caller can fall back. */
export async function generateWithOpenAi<T>(
  parts: Part[],
  schema: Schema,
  validator: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let spoken: string | null = null;
  const content: ChatContent[] = [];

  for (const part of parts) {
    const file = part.inlineData;
    if (file?.mimeType?.startsWith("audio/") || file?.mimeType === "video/webm") {
      const mime = file.mimeType;
      const audio = Buffer.from(file.data ?? "", "base64");
      spoken = await firstSuccess(
        transcribeModels,
        (model, signal) => transcribeWith(model, audio, mime, signal),
        TRANSCRIBE_BUDGET,
        warn,
      );
      content.push({
        type: "text",
        text: spoken
          ? `The recording has already been transcribed. This is exactly what was said: """${spoken}"""`
          : "The recording contained no intelligible speech.",
      });
    } else if (file?.mimeType === "application/pdf") {
      content.push({
        type: "file",
        file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${file.data ?? ""}` },
      });
    } else if (file?.mimeType) {
      if (!IMAGE_TYPES.has(file.mimeType)) throw new Error(`image type not supported: ${file.mimeType}`);
      content.push({ type: "image_url", image_url: { url: `data:${file.mimeType};base64,${file.data ?? ""}` } });
    } else if (part.text) {
      content.push({ type: "text", text: part.text });
    }
  }

  // A plain voice note needs only the words, so skip the second call.
  const keys = Object.keys(schema.properties ?? {});
  if (spoken !== null && keys.length === 1 && keys[0] === "transcript") {
    return validator.parse({ transcript: spoken });
  }

  const jsonSchema = toJsonSchema(schema);
  return firstSuccess(
    chatModels,
    async (model, signal) => {
      const answer = await chatWith(model, content, jsonSchema, signal);
      // The transcript is what the speech model heard, never the chat model's rewording.
      const faithful =
        spoken !== null && answer && typeof answer === "object" && "transcript" in answer
          ? { ...answer, transcript: spoken }
          : answer;
      const parsed = validator.safeParse(faithful);
      if (!parsed.success) throw new Error("unexpected response shape");
      return parsed.data;
    },
    CHAT_BUDGET,
    warn,
  );
}
