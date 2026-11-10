
/** Shrink a phone photo before upload. If compression fails, send the original. */
export async function compressImage(file: File): Promise<Blob> {
  try {
    // Loaded only when a photo is picked, to keep the first download small.
    const { default: imageCompression } = await import("browser-image-compression");
    return await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1600, useWebWorker: true });
  } catch {
    return file;
  }
}
