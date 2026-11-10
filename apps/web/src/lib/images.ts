import workerScript from "browser-image-compression/dist/browser-image-compression.js?url";
import { ApiError } from "../data/errors";

/** The API refuses a single file above this. Keep in step with MAX_UPLOAD_BYTES in the API's app.ts. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const MAX_SIDE = 1600;
const TARGET_MB = 0.8;
/** A cheap phone can take this long on a huge photo. After it, one quick canvas pass does the job. */
const LIBRARY_TIMEOUT_MS = 15_000;

/**
 * The library's worker loads a copy of itself, by default from a public CDN. On a slow or
 * filtered connection that request can hang for ever, so the upload never starts. Serving our
 * own copy removes the dependency, and the deadline covers anything else that stalls.
 */
async function withLibrary(file: File): Promise<Blob | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Loaded only when a photo is picked, to keep the first download small.
    const { default: imageCompression } = await import("browser-image-compression");
    const work = imageCompression(file, {
      maxSizeMB: TARGET_MB,
      maxWidthOrHeight: MAX_SIDE,
      useWebWorker: true,
      libURL: new URL(workerScript, window.location.href).href,
      fileType: "image/jpeg",
      maxIteration: 6,
      signal: controller.signal,
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("compression timed out")), LIBRARY_TIMEOUT_MS);
    });
    return await Promise.race([work, deadline]);
  } catch {
    controller.abort();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One resize and one JPEG encode. No loop, so it always finishes quickly. */
async function withCanvas(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    // A transparent PNG would otherwise turn black in the JPEG.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

/** Shrink a phone photo before upload. Always finishes. If nothing can shrink it, the original goes up as it is. */
export async function compressImage(file: File): Promise<Blob> {
  return (await withLibrary(file)) ?? (await withCanvas(file)) ?? file;
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

function withinLimit(file: Blob): Blob {
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError("FILE_TOO_LARGE", "This file is too large.");
  return file;
}

/** Ready to upload, or an ApiError the screen can show. */
export async function prepareImage(file: File): Promise<Blob> {
  // Some Android pickers give no type at all, so a blank one still gets a chance.
  if (file.type && !file.type.startsWith("image/")) throw new ApiError("FILE_NOT_SUPPORTED", "This file type is not supported.");
  return withinLimit(await compressImage(file));
}

/** For a CNIC, which may be a photo or a PDF scan. A PDF is sent untouched. */
export async function prepareDocument(file: File): Promise<Blob> {
  return isPdf(file) ? withinLimit(file) : prepareImage(file);
}
