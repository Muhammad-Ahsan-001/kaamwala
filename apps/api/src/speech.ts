import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { openaiConfigured, synthesizeUrdu } from "./openai";

const root = path.resolve(env.UPLOAD_DIR, "speech");

/** Spoken Urdu for a line of text, or null when no provider can speak. The same words are only generated once. */
export async function speechFor(text: string): Promise<Buffer | null> {
  if (!openaiConfigured) return null;
  const file = path.join(root, `${createHash("sha256").update(text).digest("hex")}.mp3`);
  const saved = await readFile(file).catch(() => null);
  if (saved) return saved;
  const audio = await synthesizeUrdu(text);
  // A full disk should cost the saving, not the speech.
  await mkdir(root, { recursive: true })
    .then(() => writeFile(file, audio))
    .catch(() => undefined);
  return audio;
}
