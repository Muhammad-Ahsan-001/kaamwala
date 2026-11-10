import { createHmac, timingSafeEqual } from "node:crypto";

/** Pure helpers for stored media. Nothing here reads the environment or touches the disk. */

const ascii = (data: Buffer, start: number, end: number) => data.subarray(start, end).toString("latin1");

const isWebm = (d: Buffer) => d.length >= 4 && d[0] === 0x1a && d[1] === 0x45 && d[2] === 0xdf && d[3] === 0xa3;
const isOgg = (d: Buffer) => ascii(d, 0, 4) === "OggS";
const isMp4 = (d: Buffer) => ascii(d, 4, 8) === "ftyp";
const isWav = (d: Buffer) => ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 12) === "WAVE";
const isAdts = (d: Buffer) => d.length >= 2 && d[0] === 0xff && ((d[1] as number) & 0xf6) === 0xf0;
const isAac = (d: Buffer) => isAdts(d) || ascii(d, 0, 4) === "ADIF" || isMp4(d);
const isMp3 = (d: Buffer) =>
  ascii(d, 0, 3) === "ID3" || (d.length >= 2 && d[0] === 0xff && ((d[1] as number) & 0xe0) === 0xe0);

const SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  "audio/webm": isWebm,
  "video/webm": isWebm,
  "audio/ogg": isOgg,
  "audio/mp4": isMp4,
  "audio/m4a": isMp4,
  "audio/x-m4a": isMp4,
  "audio/aac": isAac,
  "audio/mpeg": isMp3,
  "audio/mp3": isMp3,
  "audio/wav": isWav,
  "audio/x-wav": isWav,
};

/** True only when the file's first bytes are the container its declared type says it is. */
export function audioBytesMatch(data: Buffer, mime: string): boolean {
  return SIGNATURES[mime]?.(data) ?? false;
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

export function isHeic(data: Buffer): boolean {
  return ascii(data, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(data, 8, 12));
}

export const AUDIO_FILE_NAME = /^[0-9a-f-]{36}\.(?:webm|ogg|m4a|aac|mp3|wav)$/;
export const isAudioPath = (file: string) => /\.(?:webm|ogg|m4a|aac|mp3|wav)$/i.test(file);

/** Older rows hold a whole URL and newer rows a file name. Both end in the file name. */
export const audioFileName = (stored: string) => stored.split("?")[0]?.split("/").pop() ?? "";

export function signAudio(secret: string, name: string, expires: number): string {
  return createHmac("sha256", secret).update(`audio:${name}:${expires}`).digest("base64url");
}

export function audioSignatureValid(
  secret: string,
  name: string,
  expires: number,
  signature: string,
  nowSeconds: number,
): boolean {
  if (!Number.isInteger(expires) || expires < nowSeconds) return false;
  const expected = Buffer.from(signAudio(secret, name, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
