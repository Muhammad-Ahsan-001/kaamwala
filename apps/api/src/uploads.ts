import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import sharp from "sharp";
import { env } from "./env";
import { AppError, badRequest } from "./errors";

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

const publicUrl = (name: string) => `${env.PUBLIC_API_URL}/uploads/${name}`;

async function store(name: string, data: Buffer): Promise<string> {
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(path.join(uploadRoot, name), data);
  return publicUrl(name);
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
    return { url: await store(`${randomUUID()}.webp`, webp), jpeg };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(415, "INVALID_IMAGE", "This file is not a readable image.");
  }
}

/** For Gemini only: nothing is written to disk. Used for CNIC photos. */
export async function imageForAi(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    throw new AppError(415, "INVALID_IMAGE", "This file is not a readable image.");
  }
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

export async function saveAudio(input: Buffer, mime: string): Promise<string> {
  const ext = AUDIO_EXTENSIONS[cleanMime(mime)];
  if (!ext) throw new AppError(415, "INVALID_AUDIO", "This audio format is not supported.");
  return store(`${randomUUID()}.${ext}`, input);
}

export interface FilePart {
  data: Buffer;
  mimetype: string;
}

export interface ParsedBody {
  audio: FilePart | null;
  images: FilePart[];
  fields: Record<string, string>;
}

/** Reads either multipart (fields `audio`, `image`) or a JSON body. */
export async function readBody(req: FastifyRequest): Promise<ParsedBody> {
  const result: ParsedBody = { audio: null, images: [], fields: {} };

  if (!req.isMultipart()) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(body)) {
      if (value !== null && value !== undefined) {
        result.fields[key] = typeof value === "string" ? value : JSON.stringify(value);
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
      result.fields[part.fieldname] = part.value;
    }
  }
  return result;
}
