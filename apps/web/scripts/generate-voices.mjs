/**
 * Records the question clips with OpenAI's speech model. Run by hand, not part of the build:
 *
 *   node scripts/generate-voices.mjs [--report out.json]
 *
 * Reads the scripts from src/lib/question-voices.json and writes
 * public/voices/{ur,en}/<id>.mp3, skipping files that exist. To re-record a clip after
 * changing its words, delete its mp3 and bump VOICE_CACHE in src/pwa/sw.ts.
 *
 * Every Urdu clip is then transcribed and compared with its script, and re-recorded if
 * the words do not match. English clips are not checked.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.openai.com/v1";
const VOICE = "coral";
const PARALLEL = 5;
const MAX_RECORDINGS = 4;
/** Share of letters that must match. Set just above where one wrong word in a sentence lands. */
const PASS_SCORE = 0.97;
const URDU_HINT = "یہ اردو زبان میں گفتگو ہے۔";

const INSTRUCTIONS = {
  ur: "Speak in warm, clear, native Pakistani Urdu, like a kind neighbour explaining something to a person who cannot read. Use natural Urdu pronunciation, not Hindi or Arabic. Keep an unhurried pace with a short pause between sentences.",
  en: "Speak in warm, clear English with a light Pakistani accent, like a kind neighbour explaining something. Keep an unhurried pace with a short pause between sentences.",
};

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const clipPath = (lang, id) => join(webRoot, "public", "voices", lang, `${id}.mp3`);

function apiKey() {
  const env = readFileSync(join(webRoot, "..", "api", ".env"), "utf8");
  const line = env.split(/\r?\n/).find((entry) => entry.trim().startsWith("OPENAI_API_KEY="));
  const key = line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!key) throw new Error("OPENAI_API_KEY is not set in apps/api/.env");
  return key;
}

const auth = { Authorization: `Bearer ${apiKey()}` };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries rate limits, server errors and dropped connections. Errors carry only the status, never the request. */
async function post(path, init) {
  for (let attempt = 1; ; attempt += 1) {
    let status = "network error";
    try {
      const res = await fetch(`${API}${path}`, { method: "POST", ...init, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return res;
      const body = await res.json().catch(() => null);
      status = `HTTP ${res.status} ${body?.error?.code ?? body?.error?.type ?? ""}`.trim();
      if (res.status !== 429 && res.status < 500) throw new Error(`${path}: ${status}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith(path)) throw err;
    }
    if (attempt >= 5) throw new Error(`${path}: ${status}`);
    await sleep(1500 * 2 ** attempt);
  }
}

async function record(lang, text) {
  const res = await post("/audio/speech", {
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: VOICE, input: text, instructions: INSTRUCTIONS[lang], response_format: "mp3" }),
  });
  return Buffer.from(await res.arrayBuffer());
}

async function transcribe(mp3) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), "clip.mp3");
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "ur");
  form.append("prompt", URDU_HINT);
  form.append("chunking_strategy", "auto");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const res = await post("/audio/transcriptions", { headers: auth, body: form });
  return (await res.json()).text ?? "";
}

/** Reduces both sides to bare letters, so punctuation, spacing and spelling variants do not count as differences. */
function letters(text) {
  return text
    .normalize("NFC")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ھۂة]/g, "ہ")
    .replace(/ئ/g, "ی")
    .replace(/[آأ]/g, "ا")
    .replace(/ء/g, "")
    // A word can end in either letter for the same sound: پتا and پتہ.
    .replace(/ہ(?!\p{L})/gu, "ا")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

const score = (script, heard) => similarity(letters(script), letters(heard));

async function inParallel(items, work) {
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

/** Keeps the best take. A clip still below the bar after every attempt is reported, not hidden. */
async function checkUrdu(id, script) {
  const file = clipPath("ur", id);
  let bestAudio = await readFile(file);
  let heard = await transcribe(bestAudio);
  let best = { score: score(script, heard), heard };
  let recordings = 0;
  while (best.score < PASS_SCORE && recordings < MAX_RECORDINGS) {
    recordings += 1;
    const take = await record("ur", script);
    heard = await transcribe(take);
    const value = score(script, heard);
    if (value > best.score) {
      best = { score: value, heard };
      bestAudio = take;
      await writeFile(file, take);
    }
  }
  return { id, script, heard: best.heard, score: Number(best.score.toFixed(3)), passed: best.score >= PASS_SCORE, rerecorded: recordings };
}

const scripts = JSON.parse(await readFile(join(webRoot, "src", "lib", "question-voices.json"), "utf8"));
const ids = Object.keys(scripts);
await mkdir(join(webRoot, "public", "voices", "ur"), { recursive: true });
await mkdir(join(webRoot, "public", "voices", "en"), { recursive: true });

const missing = ids.flatMap((id) => ["ur", "en"].filter((lang) => !existsSync(clipPath(lang, id))).map((lang) => ({ id, lang })));
console.log(`${ids.length} questions, ${missing.length} clips to record`);
await inParallel(missing, async ({ id, lang }) => {
  await writeFile(clipPath(lang, id), await record(lang, scripts[id][lang]));
  console.log(`recorded ${lang}/${id}`);
});

const results = [];
await inParallel(ids, async (id) => {
  const result = await checkUrdu(id, scripts[id].ur);
  results.push(result);
  console.log(`${result.passed ? "pass" : "FAIL"} ${result.score} ${id}${result.rerecorded ? ` (re-recorded ${result.rerecorded}x)` : ""}`);
});

const failed = results.filter((result) => !result.passed);
console.log(`Urdu check: ${results.length - failed.length}/${results.length} passed`);

const reportAt = process.argv.indexOf("--report");
if (reportAt !== -1 && process.argv[reportAt + 1]) {
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  await writeFile(process.argv[reportAt + 1], JSON.stringify(results, null, 2));
}
if (failed.length) process.exitCode = 1;
