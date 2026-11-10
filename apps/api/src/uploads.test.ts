import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://unit:test@localhost:1/none";
  process.env.JWT_SECRET = "unit-test-secret-unit-test-secret";
  process.env.CNIC_SALT = "unit-test-salt-unit-test-salt-00";
});

import sharp from "sharp";
import { documentForAi } from "./uploads";

describe("documentForAi", () => {
  it("hands a PDF to the AI untouched, whatever it was called", async () => {
    const pdf = Buffer.from("%PDF-1.4\nbody");
    const part = await documentForAi(pdf);
    expect(part.mimetype).toBe("application/pdf");
    expect(part.data.equals(pdf)).toBe(true);
  });

  it("re-encodes a photo as JPEG", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ccc" } }).png().toBuffer();
    const part = await documentForAi(png);
    expect(part.mimetype).toBe("image/jpeg");
    expect(part.data[0]).toBe(0xff);
    expect(part.data[1]).toBe(0xd8);
  });

  it("refuses a file that is neither, with a clear code", async () => {
    await expect(documentForAi(Buffer.from("plain words, not a document"))).rejects.toMatchObject({
      statusCode: 415,
      code: "INVALID_IMAGE",
    });
  });
});
