import { describe, expect, it } from "vitest";
import { AUDIO_FILE_NAME, audioBytesMatch, audioFileName, audioSignatureValid, isAudioPath, isHeic, isPdf, signAudio } from "./media";

const bytes = (...values: number[]) => Buffer.from(values);
const text = (s: string) => Buffer.from(s, "latin1");

describe("audioBytesMatch", () => {
  it.each([
    ["audio/webm", bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0)],
    ["video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0)],
    ["audio/ogg", text("OggS\0\0")],
    ["audio/mp4", text("\0\0\0\x18ftypM4A ")],
    ["audio/x-m4a", text("\0\0\0\x18ftypM4A ")],
    ["audio/mpeg", text("ID3\x04\0\0")],
    ["audio/mpeg", bytes(0xff, 0xfb, 0x90, 0)],
    ["audio/aac", bytes(0xff, 0xf1, 0x50, 0)],
    ["audio/wav", text("RIFF\0\0\0\0WAVEfmt ")],
  ])("accepts real %s", (mime, data) => {
    expect(audioBytesMatch(data, mime)).toBe(true);
  });

  it.each([
    ["audio/mpeg", text("<html>not audio</html>")],
    ["audio/webm", Buffer.alloc(64, 7)],
    ["audio/ogg", text("RIFF\0\0\0\0WAVE")],
    ["audio/mp4", bytes(1, 2)],
    ["audio/wav", text("RIFF\0\0\0\0AVI ")],
    ["audio/flac", text("fLaC")],
    ["audio/webm", Buffer.alloc(0)],
  ])("refuses %s when the bytes are something else", (mime, data) => {
    expect(audioBytesMatch(data, mime)).toBe(false);
  });
});

describe("isPdf", () => {
  it("goes by the bytes and not the name", () => {
    expect(isPdf(text("%PDF-1.7\n"))).toBe(true);
    expect(isPdf(text("this is not a pdf"))).toBe(false);
    expect(isPdf(text(""))).toBe(false);
  });
});

describe("isHeic", () => {
  it("knows an iPhone photo by its brand", () => {
    expect(isHeic(text("\0\0\0\x18ftypheic\0\0"))).toBe(true);
  });

  it("does not mistake an m4a for a photo", () => {
    expect(isHeic(text("\0\0\0\x18ftypM4A \0\0"))).toBe(false);
  });
});

describe("signed audio links", () => {
  const secret = "s".repeat(32);
  const name = "11111111-2222-3333-4444-555555555555.webm";
  const now = 1_800_000_000;

  it("accepts its own signature before it expires", () => {
    expect(audioSignatureValid(secret, name, now + 60, signAudio(secret, name, now + 60), now)).toBe(true);
  });

  it("refuses an expired link", () => {
    expect(audioSignatureValid(secret, name, now - 1, signAudio(secret, name, now - 1), now)).toBe(false);
  });

  it("refuses a later expiry on an old signature", () => {
    expect(audioSignatureValid(secret, name, now + 9999, signAudio(secret, name, now + 60), now)).toBe(false);
  });

  it("refuses a signature for another file", () => {
    const other = "99999999-2222-3333-4444-555555555555.webm";
    expect(audioSignatureValid(secret, other, now + 60, signAudio(secret, name, now + 60), now)).toBe(false);
  });

  it("refuses another secret's signature", () => {
    expect(audioSignatureValid(secret, name, now + 60, signAudio("x".repeat(32), name, now + 60), now)).toBe(false);
  });

  it("refuses a signature of the wrong length without throwing", () => {
    expect(audioSignatureValid(secret, name, now + 60, "short", now)).toBe(false);
  });
});

describe("stored audio names", () => {
  it("reads a bare name and an older full URL the same way", () => {
    const name = "11111111-2222-3333-4444-555555555555.webm";
    expect(audioFileName(name)).toBe(name);
    expect(audioFileName(`https://api.example.com/uploads/${name}`)).toBe(name);
  });

  it("only accepts names this API generates", () => {
    expect(AUDIO_FILE_NAME.test("11111111-2222-3333-4444-555555555555.mp3")).toBe(true);
    expect(AUDIO_FILE_NAME.test("../../etc/passwd")).toBe(false);
    expect(AUDIO_FILE_NAME.test("11111111-2222-3333-4444-555555555555.webp")).toBe(false);
  });

  it("tells voice notes from photos", () => {
    expect(isAudioPath("/a.webm")).toBe(true);
    expect(isAudioPath("/a.webp")).toBe(false);
  });
});
