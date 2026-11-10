import { ApiError, toErrorCode } from "../errors";
import { sessionStore } from "./session-store";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export const API_URL = trimSlash((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:3002");
export const WS_URL = trimSlash((import.meta.env.VITE_WS_URL as string | undefined) || "ws://localhost:3002");

const DEFAULT_TIMEOUT_MS = 20_000;
/** Gemini may take up to 30 seconds, and a phone upload adds to that. */
export const AI_TIMEOUT_MS = 60_000;

/** Older Android WebViews have no AbortSignal.timeout. There the request simply has no deadline. */
const deadline = (ms: number) => (typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined);

type RequestOptions = {
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
  /** "keep" for a 401 that does not mean the session ended, such as a wrong sign-in code. */
  on401?: "sign-out" | "keep";
};

/**
 * Every call to the API goes through here. Failures are always an ApiError.
 * A 401 or a suspended account ends the session; the route guard then sends the user to /app/login.
 */
export async function request<T>(method: "GET" | "POST" | "PATCH", path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = sessionStore.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${API_URL}/v1${path}`, {
      method,
      headers,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: deadline(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    text = await response.text();
  } catch {
    throw new ApiError("NETWORK", "Could not reach the server.");
  }

  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // A proxy's HTML error page. Handled below as an unknown failure.
  }

  if (response.ok) return parsed as T;

  const error = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = toErrorCode(error?.code);
  const message = typeof error?.message === "string" ? error.message : "Something went wrong.";

  const sessionEnded = (response.status === 401 && options.on401 !== "keep") || code === "ACCOUNT_SUSPENDED";
  // Only the token that was refused is cleared, so a slow reply cannot sign out a newer session.
  if (sessionEnded && sessionStore.token() === token) sessionStore.clear();

  throw new ApiError(code, message, response.status);
}

/** For the few replies that are a file rather than JSON. A refusal here never ends the session. */
export async function requestBlob(path: string, body: unknown): Promise<Blob> {
  const token = sessionStore.token();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: deadline(AI_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK", "Could not reach the server.");
  }
  if (!response.ok) throw new ApiError(response.status === 503 ? "AI_UNAVAILABLE" : "UNKNOWN", "That is not available right now.", response.status);
  return response.blob();
}

/** Null for "this does not exist" or "you may not see this". Other failures still throw. */
export async function orNull<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** Multipart field `audio`, with any plain text fields alongside it. */
export function audioForm(audio: Blob, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const base = audio.type.split(";")[0] ?? "";
  form.append("audio", audio, `voice.${AUDIO_EXTENSIONS[base] ?? "webm"}`);
  return form;
}

/** Multipart field `image`, with any plain text fields alongside it. */
export function imageForm(image: Blob, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("image", image, image.type === "application/pdf" ? "document.pdf" : "photo.jpg");
  return form;
}

/** Drops null, undefined and blank strings, because the API treats an absent field and a blank one differently. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== "")) as Partial<T>;
}
