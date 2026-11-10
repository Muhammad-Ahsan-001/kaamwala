import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import sharp from "sharp";
import { env } from "./env";
import { AppError, badRequest } from "./errors";
import { audioBytesMatch, audioFileName, audioSignatureValid, isHeic, signAudio } from "./media";

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

const publicBase = env.PUBLIC_API_URL.replace(/\/+$/, "");
const publicUrl = (name: string) => `${publicBase}/uploads/${name}`;

/** Longest text field a request may carry. Everything that reads text runs on the one main thread. */
export const MAX_TEXT_CHARS = 2000;
const TEXT_TOO_LONG = `Please keep this under ${MAX_TEXT_CHARS} characters.`;
const AUDIO_LINK_SECONDS = 60 * 60;

async function store(name: string, data: Buffer): Promise<void> {
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(path.join(uploadRoot, name), data);
}

const NOT_AN_IMAGE = "This file is not a readable image.";
const HEIC_REFUSED = "This phone photo format (HEIC) cannot be used. Please choose a JPEG photo.";

function invalidImage(input: Buffer): AppError {
  return new AppError(415, "INVALID_IMAGE", isHeic(input) ? HEIC_REFUSED : NOT_AN_IMAGE);
}

/** Resizes, strips metadata (including GPS) and re-encodes, so the original file is never served. */
export async function saveImage(input: Buffer): Promise<{ url: string; jpeg: Buffer }> {
  try {
    const base = sharp(input, { failOn: "error" }).rotate().resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    });
    const [webp, jpeg] = await Promise.all([
      base.clone().webp({ quality: 78 }).toBuffer(),
      base.clone().jpeg({ quality: 82 }).toBuffer(),
    ]);
    const name = `${randomUUID()}.webp`;
    await store(name, webp);
    return { url: publicUrl(name), jpeg };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalidImage(input);
  }
}

/**
 * For Gemini only: nothing is written to disk. Used for CNIC photos.
 * The prebuilt sharp cannot decode HEIC, but Gemini can, so a HEIC photo goes through unchanged.
 */
export async function imageForAi(input: Buffer): Promise<FilePart> {
  try {
    const data = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { data, mimetype: "image/jpeg" };
  } catch {
    if (isHeic(input)) return { data: input, mimetype: "image/heic" };
    throw new AppError(415, "INVALID_IMAGE", NOT_AN_IMAGE);
  }
}

const OWN_IMAGE = /^[0-9a-f-]{36}\.webp$/;

/** True only for a photo this API stored, so a viewer's browser never loads a third party's server. */
export function isOwnImageUrl(url: string): boolean {
  const prefix = `${publicBase}/uploads/`;
  return url.startsWith(prefix) && OWN_IMAGE.test(url.slice(prefix.length));
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export const cleanMime = (mime: string) => (mime.split(";")[0] ?? "").trim().toLowerCase();

/** The declared type is only a claim. The first bytes have to be that kind of audio file. */
export function assertAudioFile(input: Buffer, mime: string): string {
  const clean = cleanMime(mime);
  const ext = AUDIO_EXTENSIONS[clean];
  if (!ext || !audioBytesMatch(input, clean)) {
    throw new AppError(415, "INVALID_AUDIO", "This audio format is not supported.");
  }
  return ext;
}

/** Returns the stored file name. Voice notes are private, so they are read through signed links only. */
export async function saveAudio(input: Buffer, mime: string): Promise<string> {
  const name = `${randomUUID()}.${assertAudioFile(input, mime)}`;
  await store(name, input);
  return name;
}

export function signedAudioUrl(stored: string | null, nowMs: number = Date.now()): string | null {
  if (!stored) return null;
  const name = audioFileName(stored);
  const expires = Math.floor(nowMs / 1000) + AUDIO_LINK_SECONDS;
  return `${publicBase}/v1/media/audio/${name}?exp=${expires}&sig=${signAudio(env.JWT_SECRET, name, expires)}`;
}

export const audioLinkValid = (name: string, expires: number, signature: string, nowMs: number = Date.now()) =>
  audioSignatureValid(env.JWT_SECRET, name, expires, signature, Math.floor(nowMs / 1000));

export interface FilePart {
  data: Buffer;
  mimetype: string;
}

export interface ParsedBody {
  audio: FilePart | null;
  images: FilePart[];
  fields: Record<string, string>;
}

function assertTextLength(value: string): void {
  if (value.length > MAX_TEXT_CHARS) throw new AppError(413, "TEXT_TOO_LONG", TEXT_TOO_LONG);
}

/** Reads either multipart (fields `audio`, `image`) or a JSON body. Every text field is length-capped. */
export async function readBody(req: FastifyRequest): Promise<ParsedBody> {
  const result: ParsedBody = { audio: null, images: [], fields: {} };

  if (!req.isMultipart()) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(body)) {
      if (value !== null && value !== undefined) {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        assertTextLength(text);
        result.fields[key] = text;
      }
    }
    return result;
  }

  for await (const part of req.parts()) {
    if (part.type === "file") {
      const data = await part.toBuffer();
      if (part.fieldname === "audio") result.audio = { data, mimetype: part.mimetype };
      else if (part.fieldname === "image") result.images.push({ data, mimetype: part.mimetype });
      else throw badRequest("UNKNOWN_FILE_FIELD", `Unexpected file field "${part.fieldname}".`);
    } else if (typeof part.value === "string") {
      if (part.valueTruncated) throw new AppError(413, "TEXT_TOO_LONG", TEXT_TOO_LONG);
      assertTextLength(part.value);
      result.fields[part.fieldname] = part.value;
    }
  }
  return result;
}
